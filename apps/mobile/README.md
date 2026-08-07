# FINVERSE mobile

Flutter client for Android and iOS.

> **Status: unverified scaffold.** This code was written against the API contract
> in `apps/api` but has never been compiled — the Flutter SDK was not installed
> on the machine where it was authored. Treat it as a starting point, not as
> working code. Expect to fix small things on first `flutter run`.

## Setup

Install the Flutter SDK (<https://docs.flutter.dev/get-started/install>), then:

```bash
cd apps/mobile
flutter create . --platforms=android,ios
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3100
```

`flutter create .` generates the `android/` and `ios/` platform folders, which
are intentionally not committed here — they are large, largely generated, and
regenerating them is a one-line command.

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
