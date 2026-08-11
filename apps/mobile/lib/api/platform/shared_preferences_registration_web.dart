import 'package:shared_preferences_web/shared_preferences_web.dart';

bool _registered = false;

/// Flutter 3.44 did not include this app's endorsed web implementation in the
/// generated web registrant. Register it before constructing
/// SharedPreferencesAsync so a browser startup cannot throw before first
/// frame. The plugin setter is process-local and this is intentionally
/// idempotent.
void ensureSharedPreferencesAsyncPlatform() {
  if (_registered) return;
  SharedPreferencesPlugin.registerWith(null);
  _registered = true;
}
