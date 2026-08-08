# Cheap launch path

This is the lowest-cost responsible route from the working prototype to a
personal beta. It deliberately avoids paid bank-data access, advice features,
and a production launch until users, legal terms, and security controls exist.

## Done locally

- Flutter stable is installed and the Android/iOS platform projects can be
  regenerated with `flutter create . --platforms=android,ios`.
- The Flutter dashboard passes `flutter analyze` and `flutter test`.
- The Android toolchain is installed, licensed, and has produced a verified
  debug APK at `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`.
- `.github/workflows/ci.yml` checks API tests/build plus Flutter analysis/tests
  on every push and pull request.
- The API has Postgres migrations and a database contract test. Development can
  use the free in-memory store when a database is not available.
- Users can download their transaction ledger as CSV and model a one-off
  purchase against known recurring income and bills. Both are local features;
  neither needs a paid provider or an AI service.

## Rebuild the Android APK

The Android SDK licence has been accepted for this machine. To rebuild, open a
new PowerShell window, then run:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\openjdk\jdk-21.0.8'
$env:Path = "C:\Users\samue\development\flutter\bin;$env:JAVA_HOME\bin;$env:Path"
flutter doctor
```

Then build the APK:

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter\apps\mobile
flutter build apk --debug
```

## Free personal beta

1. Keep `STORE=memory` or run the included Postgres stack locally. Do not expose
   the developer dashboard to the internet.
2. Use only the mock data provider. This exercises budgets, health score,
   subscriptions, cash-flow forecast, charts, and the credit-card planner with
   no bank-data provider charge or agreement.
3. Create a GitHub repository or use the existing remote, then commit and push.
   The included CI workflow starts automatically; no secret is needed for its
   default checks.
4. Test on your own Android device with `flutter run` after enabling USB
   debugging, or use an emulator installed through Android Studio.

## Deliberately deferred

- Real bank connections: use Plaid Sandbox for integration work. A production
  connection needs a provider agreement and a privacy/security review.
- Store distribution: Google Play registration and Apple Developer enrollment
  require your identity, terms acceptance, and payment. Android can be tested
  directly before either account exists; iOS builds require a Mac/Xcode.
- Production auth, cloud hosting, privacy policy, data deletion/export, threat
  modeling, and a professional privacy/security review are launch work, not
  safe shortcuts for a finance app.

## Official links

- [Flutter Android setup](https://docs.flutter.dev/platform-integration/android/setup)
- [Android command-line tools](https://developer.android.com/studio#command-tools)
- [Plaid Sandbox](https://plaid.com/docs/sandbox/)
- [Google Play Console](https://play.google.com/console/signup)
- [Apple Developer Program](https://developer.apple.com/programs/enroll/)
