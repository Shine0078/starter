import 'dart:convert';

// No `sqflite` import here on purpose: it does not compile for the web, and
// this file holds the types every target needs. The SQLite-backed store lives
// in platform/offline_cache_sqlite.dart behind a conditional export.
import 'package:cryptography/cryptography.dart';

class CachedApiPayload {
  const CachedApiPayload({required this.body, required this.updatedAt});

  final String body;
  final DateTime updatedAt;
}

/// An authenticated request that could not be sent while the device was
/// offline. Mutation bodies are kept as JSON so the queue can replay the
/// exact idempotent API request after connectivity returns.
class QueuedApiMutation {
  const QueuedApiMutation({
    required this.method,
    required this.path,
    required this.body,
    required this.enqueuedAt,
  });

  final String method;
  final String path;
  final String body;
  final DateTime enqueuedAt;
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
  Future<List<QueuedApiMutation>> pendingMutations(String owner);
  Future<void> enqueueMutation(
      String owner, String method, String path, String body);
  Future<void> removeMutation(String owner, String method, String path);
  Future<void> clearOwner(String owner);
}

class NoopOfflineCacheStore implements OfflineCacheStore {
  @override
  Future<CachedApiPayload?> read(String owner, String key) async => null;

  @override
  Future<void> write(String owner, String key, String body) async {}

  @override
  Future<List<QueuedApiMutation>> pendingMutations(String owner) async => [];

  @override
  Future<void> enqueueMutation(
      String owner, String method, String path, String body) async {}

  @override
  Future<void> removeMutation(String owner, String method, String path) async {}

  @override
  Future<void> clearOwner(String owner) async {}
}

class InMemoryOfflineCacheStore implements OfflineCacheStore {
  final _rows = <String, CachedApiPayload>{};
  final _mutations = <String, QueuedApiMutation>{};

  String _key(String owner, String key) => '$owner\u0000$key';

  @override
  Future<CachedApiPayload?> read(String owner, String key) async =>
      _rows[_key(owner, key)];

  @override
  Future<void> write(String owner, String key, String body) async {
    _rows[_key(owner, key)] =
        CachedApiPayload(body: body, updatedAt: DateTime.now().toUtc());
  }

  String _mutationKey(String owner, String method, String path) =>
      '$owner\u0000$method\u0000$path';

  @override
  Future<List<QueuedApiMutation>> pendingMutations(String owner) async =>
      _mutations.entries
          .where((entry) => entry.key.startsWith('$owner\u0000'))
          .map((entry) => entry.value)
          .toList()
        ..sort((a, b) => a.enqueuedAt.compareTo(b.enqueuedAt));

  @override
  Future<void> enqueueMutation(
      String owner, String method, String path, String body) async {
    final key = _mutationKey(owner, method, path);
    var mergedBody = body;
    final previous = _mutations[key];
    if (previous != null) {
      try {
        final oldJson = jsonDecode(previous.body);
        final newJson = jsonDecode(body);
        if (oldJson is Map<String, dynamic> &&
            newJson is Map<String, dynamic>) {
          mergedBody = jsonEncode({...oldJson, ...newJson});
        }
      } catch (_) {
        // Keep the newest body if an older queue row is not a JSON object.
      }
    }
    _mutations[key] = QueuedApiMutation(
      method: method,
      path: path,
      body: mergedBody,
      enqueuedAt: DateTime.now().toUtc(),
    );
  }

  @override
  Future<void> removeMutation(String owner, String method, String path) async {
    _mutations.remove(_mutationKey(owner, method, path));
  }

  @override
  Future<void> clearOwner(String owner) async {
    _rows.removeWhere((key, _) => key.startsWith('$owner\u0000'));
    _mutations.removeWhere((key, _) => key.startsWith('$owner\u0000'));
  }
}
