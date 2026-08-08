# FINVERSE mobile

Flutter client for Android and iOS.

> **Status: verified Flutter client.** The dashboard is wired to the API contract
> in `apps/api`, passes static analysis and widget tests, and has generated Android
> and iOS platform projects. A debug Android APK has been built successfully.

## Setup

Flutter is installed on this development machine. On a fresh machine, install it
from <https://docs.flutter.dev/get-started/install>, then:

```bash
cd apps/mobile
flutter create . --platforms=android,ios
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3100
```

`flutter create .` generates the `android/` and `ios/` platform folders. They are
deliberately ignored because they are generated; run the command after cloning.

## Talking to a local API

| Target | `API_BASE_URL` |
|---|---|
| Android emulator | `http://10.0.2.2:3100` |
| iOS simulator | `http://localhost:3100` |
| Physical device | `http://<your-lan-ip>:3100` |

`localhost` inside an Android emulator is the emulator itself, not your machine —
`10.0.2.2` is the host loopback alias. This trips everyone up once.

## What exists

A single dashboard screen: net position, financial health score with its
components, budget progress, and recent transactions. It reads the same
endpoints the dev dashboard at `http://localhost:3100/` uses.

## What does not

Offline-first sync, local encrypted storage, auth, and every other screen. See
[docs/04-roadmap.md](../../docs/04-roadmap.md).
