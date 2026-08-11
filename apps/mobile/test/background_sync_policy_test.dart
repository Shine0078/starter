import 'package:finverse/api/background_sync_policy.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeApi implements BackgroundSyncClient {
  _FakeApi({required this.restored, this.refreshError});

  final bool restored;
  final Object? refreshError;
  var refreshes = 0;

  @override
  Future<void> refreshConnectedBanks() async {
    refreshes += 1;
    if (refreshError != null) throw refreshError!;
  }

  @override
  Future<bool> restoreSession() async => restored;
}

void main() {
  group('background bank refresh policy', () {
    test('accepts only FINVERSE’s known scheduled task', () {
      expect(isFinverseBackgroundTask(finverseBackgroundSyncTask), isTrue);
      expect(isFinverseBackgroundTask('different-task'), isFalse);
    });

    test('does not retry when the user has no saved session', () async {
      final api = _FakeApi(restored: false);
      expect(await runBackgroundBankRefresh(api), isTrue);
      expect(api.refreshes, 0);
    });

    test('refreshes a restored session and asks the OS to retry transient failure', () async {
      final healthy = _FakeApi(restored: true);
      expect(await runBackgroundBankRefresh(healthy), isTrue);
      expect(healthy.refreshes, 1);

      final offline = _FakeApi(restored: true, refreshError: StateError('offline'));
      expect(await runBackgroundBankRefresh(offline), isFalse);
      expect(offline.refreshes, 1);
    });
  });
}
