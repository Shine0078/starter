# FINVERSE mobile

Flutter client for FINVERSE. Android and iOS share the Dart product code; the
native Plaid Link bridges use Plaid's official SDKs rather than an unsupported
Flutter wrapper. Android release compilation is verified locally; native iOS
signing and physical-device validation require macOS/Xcode.

## Run on the Android emulator

Start the API on port 3000, open `apps/mobile/android` in Android Studio, choose
an emulator, and run `MainActivity`. From a terminal the equivalent is:

```powershell
cd apps/mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

`10.0.2.2` is the Android emulator's route to the host machine. A physical
phone should use a deployed HTTPS origin, configured at build time:

```powershell
flutter build apk --release `
  --dart-define=API_BASE_URL=https://api.your-domain.example
```

For native iOS Plaid OAuth, set the Xcode build setting
`PLAID_UNIVERSAL_LINK_DOMAIN` to `api.your-domain.example` (the host in the
API's `PLAID_IOS_REDIRECT_URI`). The checked-in Runner target includes the
Associated Domains entitlement; the checked-in xcconfig uses
`api.example.invalid` only as an unsigned-build placeholder. The API serves
the matching Apple App Site Association document only when its `IOS_TEAM_ID`
and redirect are configured.

For temporary same-Wi-Fi development, an explicitly configured local HTTPS
proxy is safer than exposing the API's plain HTTP port. Do not ship a LAN,
localhost, or private-tunnel address in a release build; the public HTTPS path
described in `docs/09-launch-operations.md` works without Tailscale/VPN.

## Plaid Link

The Android application ID is `com.finverse.finance`. Add that exact package
name under Plaid Dashboard > Developers > API > Allowed Android package names,
then complete Plaid's identity verification if the dashboard prompts for it.
Until that save succeeds, Android Link-token creation fails closed with a
direct message explaining the missing allowlist entry. The web/PWA path can be
used while the owner completes this step.
The app requests a short-lived Link token from the authenticated FINVERSE API,
opens Plaid's native UI, and returns only the temporary public token to the API.
Plaid secrets and permanent access tokens never enter Flutter.

The Accounts tab supports new connections, update mode when credentials need
attention, manual sync, webhook-driven background sync, and disconnect/revoke.
Opening Plaid Link or reconnecting requires the current FINVERSE password first;
the API rate-limits and records every successful or failed step-up attempt.

## Customer workflows

The app includes a financial dashboard with charts, searchable transactions and
auditable transaction details, editable budgets, savings goals and contributions,
bank connections, subscription
detection and price-change warnings, evidence-based upcoming-bill, duplicate-charge,
and unusual-spending prompts, an in-app notification centre, notification
preferences, first-launch onboarding, and a settings/privacy area with active-device
session revocation and password-confirmed portable data export through the native
share sheet.

Core spending, budget, and financial-health visuals expose complete spoken
equivalents and are regression-tested at 200% text scaling. Physical TalkBack and
VoiceOver validation is still required before store submission.

Privacy settings also show recent security activity and default-off analytics and
product-update choices. Every grant or withdrawal is kept as versioned, append-only
server history and is included in account export and erasure.

Users can enable a device-local app lock from Settings. FINVERSE then hides all
financial UI whenever it leaves the foreground and requires platform system
authentication (PIN/passcode, fingerprint, or face) on return. Device credentials
never enter the app; only the enabled preference is kept in secure storage. The
Android integration is compiled and versioned; a generated iOS target must retain
the `NSFaceIDUsageDescription` entry before Mac/device validation.

Account creation loads the server's current Terms of Service and Privacy Notice,
opens each HTTPS document in the platform browser, requires both acknowledgements,
and sends their exact version ids. The API stores that evidence atomically with
the new user. Counsel still has to supply the reviewed documents and version ids.

Successful authenticated reads are cached locally for offline fallback. Payloads
are AES-256-GCM encrypted with a key in the platform keystore, scoped per user,
limited to 30 days, and purged on sign-out or account deletion. The dashboard labels
cached data and its last-updated time. Idempotent transaction preference writes
made offline are encrypted, queued, collapsed to the latest value, and replayed
when the session resumes or the dashboard reconnects. The UI shows a
pending-sync banner; balances remain server-authoritative.

The notification centre can request native Android/iPhone permission and surface
unread FINVERSE alerts as device-local notifications. Remote push and OS-level
background refresh still require provider credentials and native scheduling.

Settings includes an offline-friendly Help & Support centre with a credential-free
API readiness check and copyable diagnostics. Release builds may configure a
staffed contact address with `--dart-define=SUPPORT_EMAIL=support@example.com`;
the default build intentionally sends no email anywhere.

## iPhone without a VPN

When a Mac/Xcode build is not available, build the web bundle and serve it from
the public HTTPS API host:

```powershell
flutter build web --release --base-href=/app/ `
  --dart-define=API_BASE_URL=https://api.your-domain.example
```

Copy `build/web` into `infra/web/`, start the public Caddy stack, and open
`https://api.your-domain.example/app/` in Safari. **Add to Home Screen** creates
an installable PWA that uses the same HTTPS API without a VPN client.

## Verification

```powershell
flutter analyze
flutter test
flutter build apk --debug
flutter build web --release --base-href=/app/
```

The `/app/` base href is required because the public Caddy/API stack mounts
the PWA below that path. CI asserts the generated `index.html` keeps this
mount point, preventing a bundle built with the default `/` href from shipping
an install that cannot load its own assets.

The Android project is versioned because it contains the Plaid bridge, release
signing setup, application ID, launcher assets, and platform configuration.
