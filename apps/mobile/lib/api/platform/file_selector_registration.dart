// Flutter's generated web registrant can omit the endorsed file selector
// implementation in some release builds. Keep registration explicit at the
// call site so browser uploads never fall back to a method channel.
export 'file_selector_registration_stub.dart'
    if (dart.library.js_interop) 'file_selector_registration_web.dart';
