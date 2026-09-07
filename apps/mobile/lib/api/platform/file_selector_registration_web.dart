import 'package:file_selector_web/file_selector_web.dart';
import 'package:flutter_web_plugins/flutter_web_plugins.dart';

bool _registered = false;

/// Registers the browser implementation before opening the file chooser.
///
/// This is intentionally idempotent: the generated Flutter web registrant may
/// already have installed the same implementation in another build mode.
void ensureFileSelectorPlatform() {
  if (_registered) return;
  FileSelectorWeb.registerWith(webPluginRegistrar);
  _registered = true;
}
