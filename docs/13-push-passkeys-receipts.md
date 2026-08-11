# Passkeys, push, receipts, and background sync — what is wired and what the owner must do

Three MISSION2 gaps were code-completed in this repository: passkeys (WebAuthn),
remote push registration, and receipt OCR. All three are **fully implemented,
tested, and fail closed** until the operator supplies credentials or a domain.
This document is the exact owner action for each.

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

## Remote push

**Implemented (registration).**

- `POST /api/push/device` stores an opaque provider token per user
  (`push_tokens`, RLS-isolated, erased with the account).
- `DELETE /api/push/device` unregisters.
- The mobile client (`registerPushToken`, `unregisterPushToken`) and a
  `PushProvider` port with an `UnconfiguredPushProvider` that fails closed.

**Owner action for delivery.** Configure a provider adapter (FCM and/or APNs):

- Create a Firebase project / Apple push certificate, place the credentials in
  the deployment secret manager (`FCM_CREDENTIALS_JSON` or an APNs key).
- Implement a `PushProvider` adapter behind `apps/api/src/ports/push.ts`
  (mirroring the Plaid adapter pattern), then call `pushService` when a
  notification is created.
- On the device, obtain the platform token and call `registerPushToken`.
  OS-level background sync would additionally use a background scheduler
  (`workmanager`) that calls `refreshConnectedBanks()` periodically; the API
  side needs no change because sync is idempotent and cursor-based.

## Receipt OCR

**Implemented.** A provider-neutral port with a deterministic local parser
(`apps/api/src/domain/receipts/parse.ts`) that extracts merchant, date, total,
tax, currency, and line items from pasted text or an OCR transcript:

- `POST /api/receipts/scan` — recognise without persisting.
- `PUT /api/receipts/:transactionId` — attach (one receipt per transaction).
- `GET /api/receipts/:transactionId` — read back.
- The Flutter transaction detail screen has an "Attach a receipt" action.
- Images are never uploaded — only extracted fields and the text the user
  explicitly pasted (MISSION1).

**Owner action for richer OCR.** Plug a vision engine (Google Vision, Tesseract,
or an on-device model) behind `apps/api/src/ports/receipts.ts`; the local parser
remains the tested fallback.

## Everything here is gated off or fail-closed

- Passkeys: no challenge unless `WEBAUTHN_ENABLED=true` with a valid RP id/origin.
- Push: tokens accepted, delivery impossible until a provider is configured.
- Receipts: always available locally (no external dependency).
