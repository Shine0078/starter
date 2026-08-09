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
