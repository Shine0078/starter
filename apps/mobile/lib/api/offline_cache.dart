import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sqflite/sqflite.dart';

class CachedApiPayload {
  const CachedApiPayload({required this.body, required this.updatedAt});

  final String body;
  final DateTime updatedAt;
}

class EncryptedCacheEnvelope {
  const EncryptedCacheEnvelope({
    required this.nonce,
    required this.mac,
    required this.ciphertext,
  });

  final List<int> nonce;
  final List<int> mac;
  final List<int> ciphertext;
}

/// Small, independently testable authenticated-encryption boundary.
class OfflineCachePayloadCipher {
  final _algorithm = AesGcm.with256bits();

  Future<EncryptedCacheEnvelope> encrypt(
      String body, SecretKey key, List<int> aad) async {
    final box = await _algorithm.encrypt(
      utf8.encode(body),
      secretKey: key,
      nonce: _algorithm.newNonce(),
      aad: aad,
    );
    return EncryptedCacheEnvelope(
      nonce: box.nonce,
      mac: box.mac.bytes,
      ciphertext: box.cipherText,
    );
  }

  Future<String> decrypt(
      EncryptedCacheEnvelope envelope, SecretKey key, List<int> aad) async {
    final clear = await _algorithm.decrypt(
      SecretBox(
        envelope.ciphertext,
        nonce: envelope.nonce,
        mac: Mac(envelope.mac),
      ),
      secretKey: key,
      aad: aad,
    );
    return utf8.decode(clear);
  }
}

abstract class OfflineCacheStore {
  Future<CachedApiPayload?> read(String owner, String key);
  Future<void> write(String owner, String key, String body);
  Future<void> clearOwner(String owner);
}

class NoopOfflineCacheStore implements OfflineCacheStore {
  @override
  Future<CachedApiPayload?> read(String owner, String key) async => null;

  @override
  Future<void> write(String owner, String key, String body) async {}

  @override
  Future<void> clearOwner(String owner) async {}
}

class InMemoryOfflineCacheStore implements OfflineCacheStore {
  final _rows = <String, CachedApiPayload>{};

  String _key(String owner, String key) => '$owner\u0000$key';

  @override
  Future<CachedApiPayload?> read(String owner, String key) async =>
      _rows[_key(owner, key)];

  @override
  Future<void> write(String owner, String key, String body) async {
    _rows[_key(owner, key)] =
        CachedApiPayload(body: body, updatedAt: DateTime.now().toUtc());
  }

  @override
  Future<void> clearOwner(String owner) async {
    _rows.removeWhere((key, _) => key.startsWith('$owner\u0000'));
  }
}

/// SQLite cache whose payload columns contain only AES-256-GCM ciphertext.
///
/// The database file is still protected by the app sandbox. Encrypting each
/// payload adds a second boundary for device backups and filesystem extraction;
/// the randomly generated key is stored separately in the platform keystore.
class EncryptedSqliteOfflineCache implements OfflineCacheStore {
  EncryptedSqliteOfflineCache({FlutterSecureStorage? secureStorage})
      : _secureStorage = secureStorage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
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
