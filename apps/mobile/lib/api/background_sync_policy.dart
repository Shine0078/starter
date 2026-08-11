/// The stable native scheduler identifier. On iOS it must also be listed in
/// `BGTaskSchedulerPermittedIdentifiers` exactly as written.
const finverseBackgroundSyncTask = 'com.finverse.finance.background-sync';

/// Six hours is intentionally a hint, not a promise. Android may defer work
/// for battery/network constraints and iOS schedules opportunistically.
const finverseBackgroundSyncFrequency = Duration(hours: 6);

abstract interface class BackgroundSyncClient {
  Future<bool> restoreSession();
  Future<void> refreshConnectedBanks();
}

bool isFinverseBackgroundTask(String taskName) =>
    taskName == finverseBackgroundSyncTask;

/// Runs a minimal, non-interactive refresh in a background isolate.
///
/// A missing/expired session is normal: do not ask the OS to retry merely
/// because the user signed out. A transient API or network failure returns
/// false, which lets WorkManager/BGTaskScheduler apply its own backoff.
Future<bool> runBackgroundBankRefresh(BackgroundSyncClient api) async {
  try {
    if (!await api.restoreSession()) return true;
    await api.refreshConnectedBanks();
    return true;
  } catch (_) {
    return false;
  }
}
