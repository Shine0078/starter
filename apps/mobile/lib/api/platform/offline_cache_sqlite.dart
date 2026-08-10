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
      version: 2,
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
        await db.execute('''
          CREATE TABLE api_mutations (
            owner_hash TEXT NOT NULL,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            nonce BLOB NOT NULL,
            mac BLOB NOT NULL,
            ciphertext BLOB NOT NULL,
            enqueued_at TEXT NOT NULL,
            PRIMARY KEY (owner_hash, method, path)
          )
        ''');
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute('''
            CREATE TABLE api_mutations (
              owner_hash TEXT NOT NULL,
              method TEXT NOT NULL,
              path TEXT NOT NULL,
              nonce BLOB NOT NULL,
              mac BLOB NOT NULL,
              ciphertext BLOB NOT NULL,
              enqueued_at TEXT NOT NULL,
              PRIMARY KEY (owner_hash, method, path)
            )
          ''');
        }
      },
    );
    await db.delete(
      'api_cache',
      where: 'updated_at < ?',
      whereArgs: [DateTime.now().toUtc().subtract(_maxAge).toIso8601String()],
    );
    await db.delete(
      'api_mutations',
      where: 'enqueued_at < ?',
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

  List<int> _mutationAad(
          String ownerHash, String method, String path, String enqueuedAt) =>
      utf8.encode(
          'finverse-mutation-v1\u0000$ownerHash\u0000$method\u0000$path\u0000$enqueuedAt');

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
  Future<List<QueuedApiMutation>> pendingMutations(String owner) async {
    final ownerHash = await _ownerHash(owner);
    final db = await _db;
    final rows = await db.query(
      'api_mutations',
      where: 'owner_hash = ?',
      whereArgs: [ownerHash],
      orderBy: 'enqueued_at ASC',
    );
    final pending = <QueuedApiMutation>[];
    for (final row in rows) {
      final method = row['method']! as String;
      final path = row['path']! as String;
      final enqueuedAtString = row['enqueued_at']! as String;
      try {
        final body = await _cipher.decrypt(
          EncryptedCacheEnvelope(
            ciphertext: (row['ciphertext']! as Uint8List).toList(),
            nonce: (row['nonce']! as Uint8List).toList(),
            mac: (row['mac']! as Uint8List).toList(),
          ),
          await _key,
          _mutationAad(ownerHash, method, path, enqueuedAtString),
        );
        pending.add(QueuedApiMutation(
          method: method,
          path: path,
          body: body,
          enqueuedAt: DateTime.parse(enqueuedAtString).toUtc(),
        ));
      } catch (_) {
        // A missing keystore key or modified row must not be replayed.
        await db.delete(
          'api_mutations',
          where: 'owner_hash = ? AND method = ? AND path = ?',
          whereArgs: [ownerHash, method, path],
        );
      }
    }
    return pending;
  }

  @override
  Future<void> enqueueMutation(
      String owner, String method, String path, String body) async {
    final ownerHash = await _ownerHash(owner);
    final enqueuedAt = DateTime.now().toUtc().toIso8601String();
    final db = await _db;
    var mergedBody = body;
    final existing = await db.query(
      'api_mutations',
      where: 'owner_hash = ? AND method = ? AND path = ?',
      whereArgs: [ownerHash, method, path],
      limit: 1,
    );
    if (existing.isNotEmpty) {
      final row = existing.single;
      try {
        final oldBody = await _cipher.decrypt(
          EncryptedCacheEnvelope(
            ciphertext: (row['ciphertext']! as Uint8List).toList(),
            nonce: (row['nonce']! as Uint8List).toList(),
            mac: (row['mac']! as Uint8List).toList(),
          ),
          await _key,
          _mutationAad(
            ownerHash,
            method,
            path,
            row['enqueued_at']! as String,
          ),
        );
        final oldJson = jsonDecode(oldBody);
        final newJson = jsonDecode(body);
        if (oldJson is Map<String, dynamic> &&
            newJson is Map<String, dynamic>) {
          mergedBody = jsonEncode({...oldJson, ...newJson});
        }
      } catch (_) {
        // Keep the newest body if the previous row cannot be authenticated.
      }
    }
    final box = await _cipher.encrypt(
      mergedBody,
      await _key,
      _mutationAad(ownerHash, method, path, enqueuedAt),
    );
    await db.insert(
      'api_mutations',
      {
        'owner_hash': ownerHash,
        'method': method,
        'path': path,
        'nonce': Uint8List.fromList(box.nonce),
        'mac': Uint8List.fromList(box.mac),
        'ciphertext': Uint8List.fromList(box.ciphertext),
        'enqueued_at': enqueuedAt,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  @override
  Future<void> removeMutation(String owner, String method, String path) async {
    await (await _db).delete(
      'api_mutations',
      where: 'owner_hash = ? AND method = ? AND path = ?',
      whereArgs: [await _ownerHash(owner), method, path],
    );
  }

  @override
  Future<void> clearOwner(String owner) async {
    final db = await _db;
    final ownerHash = await _ownerHash(owner);
    await db.delete(
      'api_cache',
      where: 'owner_hash = ?',
      whereArgs: [ownerHash],
    );
    await db.delete(
      'api_mutations',
      where: 'owner_hash = ?',
      whereArgs: [ownerHash],
    );
  }
}
