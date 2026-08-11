import 'dart:io' show Platform;

import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';

import '../background_sync_policy.dart';
import '../client.dart';
import '../offline_cache.dart';

bool _configured = false;

/// Registers an OS-owned, network-constrained refresh on Android and iOS.
///
/// It is deliberately a no-op on Windows/macOS/Linux even though this source
/// compiles there. The mobile scheduler owns its timing; the foreground app
/// remains the immediate refresh path.
Future<void> configureBackgroundSync() async {
  if (_configured || (!Platform.isAndroid && !Platform.isIOS)) return;
  try {
    await Workmanager().initialize(finverseBackgroundSyncDispatcher);
    await Workmanager().registerPeriodicTask(
      finverseBackgroundSyncTask,
      finverseBackgroundSyncTask,
      frequency: finverseBackgroundSyncFrequency,
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
      backoffPolicy: BackoffPolicy.exponential,
      backoffPolicyDelay: const Duration(minutes: 15),
      tag: finverseBackgroundSyncTask,
    );
    _configured = true;
  } catch (_) {
    // A scheduler denial (battery policy, an incomplete iOS development
    // provisioning profile, etc.) must never prevent interactive banking.
    // The next app launch can safely try registration again.
  }
}

/// Kept as a top-level entry point because Android/iOS launch this in a fresh
/// isolate after the foreground UI is gone.
@pragma('vm:entry-point')
void finverseBackgroundSyncDispatcher() {
  Workmanager().executeTask((taskName, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();
    // The Android embedding registers plugins automatically; the iOS
    // AppDelegate supplies the equivalent registrant callback for its
    // separately launched background engine. Keep the input in scope so a
    // future version can use a non-sensitive task mode without changing the
    // isolate entry-point signature.
    assert(inputData == null || inputData.isEmpty);
    if (!isFinverseBackgroundTask(taskName)) return true;
    final api = ApiClient(offlineCache: NoopOfflineCacheStore());
    return runBackgroundBankRefresh(api);
  });
}
