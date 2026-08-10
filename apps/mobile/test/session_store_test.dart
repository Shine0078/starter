import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_secure_storage/test/test_flutter_secure_storage_platform.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:finverse/api/session_store.dart';

const _old = SessionTokens(
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  refreshExpiresAt: '2026-09-10T12:00:00.000Z',
);
const _replacement = SessionTokens(
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  refreshExpiresAt: '2026-10-10T12:00:00.000Z',
);

class FailingPlatform extends TestFlutterSecureStoragePlatform {
  FailingPlatform(super.data,
      {this.failTokenWrite = false, this.failTombstoneDelete = false});

  final bool failTokenWrite;
  final bool failTombstoneDelete;

  @override
  Future<void> write({
    required String key,
    required String value,
    required Map<String, String> options,
  }) {
    if (failTokenWrite && key == 'finverse.session') {
      return Future<void>.error(StateError('token write failed'));
    }
    return super.write(key: key, value: value, options: options);
  }

  @override
  Future<void> delete({
    required String key,
    required Map<String, String> options,
  }) {
    if (failTombstoneDelete && key == 'finverse.session.signed_out') {
      return Future<void>.error(StateError('tombstone delete failed'));
    }
    return super.delete(key: key, options: options);
  }
}

void main() {
  late FlutterSecureStoragePlatform previous;

  setUp(() => previous = FlutterSecureStoragePlatform.instance);
  tearDown(() => FlutterSecureStoragePlatform.instance = previous);

  test(
      'failed token write keeps the signed-out tombstone ahead of an old token',
      () async {
    final data = <String, String>{
      'finverse.session': _encode(_old),
      'finverse.session.signed_out': '1',
    };
    FlutterSecureStoragePlatform.instance =
        FailingPlatform(data, failTokenWrite: true);
    final store = SecureSessionStore(storage: const FlutterSecureStorage());

    await expectLater(store.write(_replacement),
        throwsA(isA<SessionStoreUnavailableException>()));
    expect(await store.read(), isNull);
    expect(data['finverse.session.signed_out'], '1');
    expect(data['finverse.session'], _encode(_old));
  });

  test('failed tombstone cleanup hides the newly written token until retry',
      () async {
    final data = <String, String>{'finverse.session.signed_out': '1'};
    FlutterSecureStoragePlatform.instance =
        FailingPlatform(data, failTombstoneDelete: true);
    final store = SecureSessionStore(storage: const FlutterSecureStorage());

    await expectLater(store.write(_replacement),
        throwsA(isA<SessionStoreUnavailableException>()));
    expect(await store.read(), isNull);
    expect(data['finverse.session.signed_out'], '1');
    expect(data['finverse.session'], _encode(_replacement));
  });
}

String _encode(SessionTokens tokens) =>
    '{"accessToken":"${tokens.accessToken}","refreshToken":"${tokens.refreshToken}","refreshExpiresAt":"${tokens.refreshExpiresAt}"}';
