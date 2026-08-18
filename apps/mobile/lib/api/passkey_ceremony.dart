/// Platform WebAuthn ceremony used after the API issues a challenge.
///
/// The HTTP contract lives on [ApiClient]. This port is only the browser or
/// OS authenticator step. Web uses navigator.credentials; native builds
/// report unsupported until Credential Manager / ASAuthorization is wired.
library;

export 'passkey_ceremony_stub.dart'
    if (dart.library.js_interop) 'passkey_ceremony_web.dart';
