/// Platform WebAuthn ceremony used after the API issues a challenge.
///
/// The HTTP contract lives on [ApiClient]. This port is only the browser or
/// OS authenticator step. Web uses navigator.credentials; native Android and
/// iOS use Credential Manager / AuthenticationServices. Tests keep the stub.
library;

export 'passkey_ceremony_stub.dart'
    if (dart.library.io) 'passkey_ceremony_native.dart'
    if (dart.library.js_interop) 'passkey_ceremony_web.dart';
