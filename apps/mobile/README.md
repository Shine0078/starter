# FINVERSE mobile

Flutter client for FINVERSE. Android is the verified launch target; the native
Plaid Link bridge uses Plaid's official Android SDK rather than an unsupported
Flutter wrapper.

## Run on the Android emulator

Start the API on port 3100, open `apps/mobile/android` in Android Studio, choose
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

## Verification

```powershell
flutter analyze
flutter test
flutter build apk --debug
```

The Android project is versioned because it contains the Plaid bridge, release
signing setup, application ID, launcher assets, and platform configuration.
