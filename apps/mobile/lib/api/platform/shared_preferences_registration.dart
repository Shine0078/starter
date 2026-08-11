// The endorsed shared_preferences implementations register themselves on
// native platforms. The Flutter 3.44 web registrant omitted the endorsed web
// implementation in this application, so the conditional web implementation
// below performs that small, idempotent registration before we construct
// SharedPreferencesAsync.
export 'shared_preferences_registration_stub.dart'
    if (dart.library.js_interop) 'shared_preferences_registration_web.dart';
