import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sqflite/sqflite.dart';

import '../offline_cache.dart';

/// SQLite cache whose payload columns contain only AES-256-GCM ciphertext.
///
/// Native targets only. `sqflite` has no web implementation, which is why this
/// class lives behind the conditional export in offline_cache_factory.dart
/// rather than in offline_cache.dart alongside the types it implements.
///
/// The database file is still protected by the app sandbox. Encrypting each
/// payload adds a second boundary for device backups and filesystem extraction;
/// the randomly generated key is stored separately in the platform keystore.
class EncryptedSqliteOfflineCache implements OfflineCacheStore {
  EncryptedSqliteOfflineCache({FlutterSecureStorage? secureStorage})
      : _secureStorage = secureStorage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(migrateWithBackup: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  static const _databaseName = 'finverse-offline-cache.db';
  static const _keyName = 'finverse.offline-cache.aes-key.v1';
  static const _maxAge = Duration(days: 30);

  final FlutterSecureStorage _secureStorage;
  final _cipher = OfflineCachePayloadCipher();
  Database? _database;
  Future<SecretKey>? _keyFuture;

  Future<Database> get _db async {
    if (_database != null) return _database!;
    final db = await openDatabase(
      _databaseName,
      version: 1,
      onCreate: (db, _) async {
        await db.execute('''
          CREATE TABLE api_cache (
            owner_hash TEXT NOT NULL,
            cache_key TEXT NOT NULL,
            nonce BLOB NOT NULL,
            mac BLOB NOT NULL,
            ciphertext BLOB NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (owner_hash, cache_key)
          )
        ''');
      },
    );
    await db.delete(
      'api_cache',
      where: 'updated_at < ?',
      whereArgs: [DateTime.now().toUtc().subtract(_maxAge).toIso8601String()],
    );
    _database = db;
    return db;
  }

  Future<SecretKey> get _key => _keyFuture ??= _loadOrCreateKey();

  Future<SecretKey> _loadOrCreateKey() async {
    var encoded = await _secureStorage.read(key: _keyName);
    if (encoded == null) {
      final random = Random.secure();
      final bytes = List<int>.generate(32, (_) => random.nextInt(256));
      encoded = base64UrlEncode(bytes);
      await _secureStorage.write(key: _keyName, value: encoded);
    }
    final bytes = base64Url.decode(base64Url.normalize(encoded));
    if (bytes.length != 32) {
      throw StateError('Offline cache key has an invalid length.');
    }
    return SecretKey(bytes);
  }

  Future<String> _ownerHash(String owner) async {
    final hash = await Sha256().hash(utf8.encode(owner));
    return base64UrlEncode(hash.bytes).replaceAll('=', '');
  }

  List<int> _aad(String ownerHash, String key, String updatedAt) => utf8
      .encode('finverse-cache-v1\u0000$ownerHash\u0000$key\u0000$updatedAt');

  @override
  Future<CachedApiPayload?> read(String owner, String key) async {
    final ownerHash = await _ownerHash(owner);
    final db = await _db;
    final rows = await db.query(
      'api_cache',
      where: 'owner_hash = ? AND cache_key = ?',
      whereArgs: [ownerHash, key],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    final row = rows.single;
    final updatedAt = DateTime.parse(row['updated_at']! as String).toUtc();
    if (DateTime.now().toUtc().difference(updatedAt) > _maxAge) {
      await db.delete(
        'api_cache',
        where: 'owner_hash = ? AND cache_key = ?',
        whereArgs: [ownerHash, key],
      );
      return null;
    }

    try {
      final clear = await _cipher.decrypt(
        EncryptedCacheEnvelope(
          ciphertext: (row['ciphertext']! as Uint8List).toList(),
          nonce: (row['nonce']! as Uint8List).toList(),
          mac: (row['mac']! as Uint8List).toList(),
        ),
        await _key,
        _aad(ownerHash, key, row['updated_at']! as String),
      );
      return CachedApiPayload(body: clear, updatedAt: updatedAt);
    } catch (_) {
      // A restored database with a missing keystore key, or a modified row,
      // must fail closed instead of returning unauthenticated financial data.
      await db.delete(
        'api_cache',
        where: 'owner_hash = ? AND cache_key = ?',
        whereArgs: [ownerHash, key],
      );
      return null;
    }
  }

  @override
  Future<void> write(String owner, String key, String body) async {
    final ownerHash = await _ownerHash(owner);
    final updatedAt = DateTime.now().toUtc().toIso8601String();
    final box = await _cipher.encrypt(
      body,
      await _key,
      _aad(ownerHash, key, updatedAt),
    );
    await (await _db).insert(
      'api_cache',
      {
        'owner_hash': ownerHash,
        'cache_key': key,
        'nonce': Uint8List.fromList(box.nonce),
        'mac': Uint8List.fromList(box.mac),
        'ciphertext': Uint8List.fromList(box.ciphertext),
        'updated_at': updatedAt,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  @override
  Future<void> clearOwner(String owner) async {
    await (await _db).delete(
      'api_cache',
      where: 'owner_hash = ?',
      whereArgs: [await _ownerHash(owner)],
    );
  }
}
