# Passkeys, push, receipts, and background sync — what is wired and what the owner must do

Passkeys (WebAuthn), remote-push delivery/background refresh, and receipt text
parsing are code-completed here. Every integration is fail-closed until the operator
supplies its required domain, credentials, or Apple configuration. This
document records the exact owner action for each.

## Passkeys (WebAuthn)

**Implemented.** A pure-Node FIDO2 verifier:

- Challenge issuance (`POST /api/webauthn/register/options`,
  `POST /api/webauthn/login/options`).
- Registration verification (`POST /api/webauthn/register/verify`) — checks
  client data (type/challenge/origin), the RP-id hash in authData, the user
  presence flag, parses the CBOR attestation object, extracts the COSE ES256
  public key, and stores it per user.
- Login verification (`POST /api/webauthn/login/verify`) — verifies the ES256
  signature over `authData || sha256(clientDataJSON)` and enforces sign-counter
  monotonicity (a regression is treated as a cloned key).
- Credential management (`GET/DELETE /api/webauthn/credentials`) with row-level
  security and account-erasure cascade.
- Tested end-to-end with a genuinely generated P-256 key pair and a hand-built
  attestation object (`apps/api/test/webauthn.spec.ts`).

**Owner action to switch it on.** Passkeys need a registered, public domain —
this is a real technical requirement, not a shortcut:

```env
WEBAUTHN_ENABLED=true
WEBAUTHN_RP_ID=api.your-domain.example     # must equal the origin host
WEBAUTHN_ORIGIN=https://api.your-domain.example
WEBAUTHN_RP_NAME=FINVERSE
```

Then, in the Flutter app, a native passkey button calls
`passkeyRegisterOptions()` / `passkeyLoginOptions()` from `lib/api/client.dart`
and hands the challenge to the platform authenticator (iOS `ASAuthorization` /
Android Credential Manager). The mobile client methods are implemented and
tested; the platform ceremony wiring is the remaining owner/device step.

## Remote push and background sync

**Implemented (server delivery and scheduler preparation).**

- `POST /api/push/device` stores an opaque provider target per user
  (`push_tokens`, RLS-isolated, erased with the account); `DELETE` removes it.
- `FcmHttpV1PushProvider` is selected automatically when
  `FCM_CREDENTIALS_JSON` exists. It signs a service-account OAuth assertion
  with Node's built-in crypto, caches the short-lived bearer token, and sends
  Android, web, and APNs-routed iOS notifications through FCM HTTP v1.
- An alert is persisted before delivery. The lock-screen push deliberately says
  only “FINVERSE alert — Open FINVERSE to view an important account alert”; it
  never contains a merchant, balance, amount, or bank name. The authenticated
  app fetches the complete alert after opening.
- A confirmed FCM `UNREGISTERED` target is removed. Timeouts, credential
  faults, and other transient failures do **not** delete a user's token.
- Native Flutter builds initialise `workmanager` and register
  `com.finverse.finance.background-sync` with network constraints. Its isolated
  callback restores the Keychain/Keystore session and calls the idempotent,
  cursor-based `refreshConnectedBanks()`. A missing session succeeds quietly;
  a transient network/API failure asks the OS to retry. Web and desktop are
  explicit no-ops.
- iOS already declares the matching BGTask identifier and Background Fetch in
  `Runner/Info.plist`, and its UIScene AppDelegate registers plugins for the
  background engine. Android needs no manual scheduler manifest entries.

**Owner action before first real delivery.**

1. In Firebase, enable the Cloud Messaging API and create a least-privileged
   service account allowed to send to this Firebase project. Save the complete
   JSON document as the production secret `FCM_CREDENTIALS_JSON`; never commit
   it or put it in a mobile build.
2. For iOS, upload an Apple APNs authentication key in Firebase Cloud Messaging
   and enable the Push Notifications and Background Modes capabilities for the
   signed Apple app identifier. This is what lets FCM route the iOS target to
   APNs; the API does not store an APNs private key.
3. Add the Firebase client configuration for the Android/iOS app and obtain an
   FCM registration token after the user grants notification permission, then
   call the existing `registerPushToken(token, 'android'|'ios')`. The API keeps
   no token across accounts after sign-out/account deletion; call
   `unregisterPushToken` when the app revokes its registration.
4. Test on a physical iPhone. iOS controls exactly when background work runs
   (and may defer it); background sync is freshness best effort, never a
   guarantee or a replacement for server-side Plaid webhooks.

## Receipt text parsing and on-device OCR

**Implemented.** A provider-neutral port with a deterministic local parser
(`apps/api/src/domain/receipts/parse.ts`) that extracts merchant, date, total,
tax, currency, and line items from pasted text or an OCR transcript:

- `POST /api/receipts/scan` — recognise without persisting.
- `PUT /api/receipts/:transactionId` — attach (one receipt per transaction).
- `GET /api/receipts/:transactionId` — read back.
- The Flutter transaction detail screen has an "Attach a receipt" action.
- Direct scanning is now native and private: Android includes the bundled Latin
  ML Kit model and iOS uses Apple Vision. The app sends the selected local file
  only to that device’s vision engine, opens the recognised transcript for the
  person to review or edit, and calls the existing text-only receipt endpoint
  only after they choose Attach. A photo never enters Flutter's API client or
  the server.
- iOS requests camera/photo-library permission only when the person initiates
  scanning. Android requests camera permission only for the camera path; the
  gallery uses the system picker without broad media access.

**Remaining verification.** Android's compiled release-mode APK includes the ML Kit
adapter (the local fallback uses debug signing, not a store key); a physical receipt
scan still needs to be exercised. Apple Vision is
source-complete but Windows cannot compile Xcode code, so a macOS/Xcode build
and physical iPhone photo scan remain required before calling native iOS OCR
verified.

## Everything here is gated off or fail-closed

- Passkeys: no challenge unless `WEBAUTHN_ENABLED=true` with a valid RP id/origin.
- Push: tokens accepted, delivery impossible until a provider is configured.
- Receipts: always available locally (no external dependency).
