# FINVERSE mobile

Flutter client for FINVERSE. Android is the verified launch target; the native
Plaid Link bridge uses Plaid's official Android SDK rather than an unsupported
Flutter wrapper.

## Run on the Android emulator

Start the API on port 3000, open `apps/mobile/android` in Android Studio, choose
an emulator, and run `MainActivity`. From a terminal the equivalent is:

```powershell
cd apps/mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

`10.0.2.2` is the Android emulator's route to the host machine. For a physical
phone, use `http://<your-computer-LAN-IP>:3000` and allow that port through the
local firewall.

## Plaid Link

The Android application ID is `com.finverse.finance`. Add that exact package
name under Plaid Dashboard > Developers > API > Allowed Android package names.
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

## Verification

```powershell
flutter analyze
flutter test
flutter build apk --debug
```

The Android project is versioned because it contains the Plaid bridge, release
signing setup, application ID, launcher assets, and platform configuration.
