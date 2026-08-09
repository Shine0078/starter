# Run FINVERSE on your phone

Two ways. One is free, works from Windows, and takes about ten minutes. The
other needs a Mac and gives you a real native app.

| | Installable PWA | Native iOS build |
|---|---|---|
| Cost | **Free** | Mac (~$599) + $99/yr for more than 7 days |
| Build from Windows | **Yes** | No — Xcode is macOS-only |
| Home-screen icon, no browser chrome | Yes | Yes |
| Update loop | Rebuild + pull to refresh (~90s) | Hot reload (<1s) |
| Bank connection (Plaid) | **No** — native SDK only | Yes |
| Biometric app lock | No | Yes |
| Offline cache | No | Yes |

Start with the PWA. Everything except bank linking, the app lock, and the
offline cache works, and none of those are needed to use the app against the
built-in sample data.

---

## Part 1 — The free way: install it as a PWA

> **Windows PowerShell 5.1 does not support `&&`.** Every command below is
> written for it: `;` chains, and full paths, because a `cd` that silently did
> not happen is the most common way these steps fail. On macOS or Linux use
> `&&` and relative paths as usual.

### 1. Build the app

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter\apps\mobile; flutter build web --release --base-href=/app/
```

Takes about 90 seconds. Output lands in `apps/mobile/build/web`.

### 2. Start the API

Use a second terminal — this one stays running.

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter; npm run dev --workspace @finverse/api
```

The API serves the compiled app at `/app/` automatically when that build exists
— same origin as the API itself, so there is no CORS to configure and no second
server to run. You should see `App  http://localhost:3000/app/` in the startup
log. Open it in a desktop browser first to confirm it works.

> If that line is missing, the build directory was not found. Run step 1.

### 3. Let your phone reach it

Two options. **Tailscale is strictly better** and is what the rest of this
document assumes.

**Option A — Tailscale (recommended).** You already have it installed.

```powershell
tailscale serve --bg 3000
```

First run prints a link to enable Serve on your tailnet; visit it once. The
proxy then survives reboots, so this is a one-time step. To stop it later:
`tailscale serve --https=443 off`.

That publishes `https://<your-machine>.<your-tailnet>.ts.net` in front of the
local API, with a real Let's Encrypt certificate. Install Tailscale on the
iPhone and sign in with the same account.

Three things this buys you over the LAN address:

- **It works anywhere** — mobile data, a café, your parents' house. Not just
  your home Wi-Fi.
- **Nothing is exposed to the internet.** Only devices on your tailnet can
  reach it.
- **It is HTTPS**, which is what makes the next step work properly. iOS only
  grants service workers, offline caching, and reliable "Add to Home Screen"
  behaviour to a *secure context*. Over plain `http://` you get a degraded
  install.

**Option B — LAN address.** Your PC is `192.168.2.152`. Windows Firewall blocks
port 3000 by default; open it from an Administrator terminal:

```bash
netsh advfirewall firewall add rule name="FINVERSE dev" dir=in action=allow protocol=TCP localport=3000
```

Then browse to `http://192.168.2.152:3000/app/` from the phone. Works, but only
on your home Wi-Fi, and without HTTPS the install is second-class.

### 4. Install it on the iPhone

1. Open the URL in **Safari**. It must be Safari — Chrome and Firefox on iOS
   cannot install a PWA to the home screen, because Apple only allows it from
   WebKit's own share sheet.
2. Tap the **Share** button (square with an arrow), scroll down, tap
   **Add to Home Screen**.
3. Name it, tap **Add**.

You now have a FINVERSE icon on your home screen. Tapping it opens full-screen
with no address bar, its own app switcher card, and its own icon — the
`apple-mobile-web-app-capable` meta tag in `web/index.html` is what does that.
Without it you would get a bookmark that opens Safari.

### 5. See your updates

There is no automatic update, because there is no app store in this loop. After
changing code:

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter\apps\mobile; flutter build web --release --base-href=/app/
```

Then pull down to refresh inside the installed app, or close it from the app
switcher and reopen. Roughly 90 seconds end to end.

**For a faster loop while actually developing**, skip the install and use the
dev server, which has hot reload:

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter\apps\mobile; flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000
```

Edit, save, and the browser updates in about a second. Develop there, then
rebuild and refresh the phone when you want to see it on the real device.

### What does not work in the browser build

Stated plainly so nothing looks broken when it is merely absent:

- **Bank connection.** Plaid Link is a native SDK with no web equivalent wired
  up here. The Accounts screen will offer manual accounts only.
- **Biometric app lock.** No browser API can challenge for a device credential,
  so the setting reports itself unavailable rather than pretending.
- **Offline cache.** Web reads always go to the network. A failure is reported
  as a failure rather than answered with month-old balances.
- **Session token storage is weaker.** On a phone build, tokens live in the iOS
  Keychain or Android Keystore. On the web they are encrypted into
  `localStorage`, which is obfuscation rather than real protection — anything
  that can run JavaScript on that origin can read them. Acceptable for your own
  phone on your own tailnet; not acceptable for real customers.

---

## Part 2 — The native iOS build, when you have a Mac

The repository is already prepared for this. Three things were fixed so the
project does not fight you on day one:

- **Bundle identifier** is `com.finverse.finance`, matching Android, rather
  than the `com.example.finverse` that `flutter create` leaves behind.
- **App Transport Security** is configured in `ios/Runner/Info.plist`.
  Arbitrary cleartext stays **off** — a release build cannot be talked into an
  unencrypted connection — but local networking is permitted so a dev API on
  your LAN is reachable. Point the app at a Tailscale HTTPS hostname and no
  exception is needed at all.
- **`ios/` and `web/` are version-controlled**, like `android/`. They carry the
  bundle ids, the ATS policy, the Face ID and local-network usage strings, and
  the PWA manifest. Leaving them generated meant `flutter create` silently
  resetting all of it.

### Steps on the Mac

```bash
xcode-select --install
```

Install Xcode from the App Store, then Flutter, then:

```bash
git clone https://github.com/Shine0078/starter.git
```

Open `apps/mobile/ios/Runner.xcworkspace` in Xcode → Runner target → Signing &
Capabilities → sign in with your Apple ID → select your personal team.

A **free Apple ID is enough** to run on your own iPhone. The app expires after
7 days and must be re-deployed; the $99/year Developer Program extends that to
a year and is what TestFlight requires.

```bash
cd apps/mobile
flutter devices
flutter run --dart-define=API_BASE_URL=https://<your-machine>.<tailnet>.ts.net
```

`r` hot-reloads in under a second, `R` restarts, `q` quits. In Xcode →
Window → Devices and Simulators, tick "Connect via network" to go wireless
after the first cable pairing.

### Still missing for iOS

- **Plaid Link has no iOS platform channel.** `android/` has the Kotlin
  bridge; the Swift equivalent has not been written. Roughly 3–5 days. Until
  then bank connection is Android-only.
- **App Store submission** needs the Apple Developer Program, a privacy
  policy, and the App Privacy questionnaire. See
  [08-what-blocks-selling.md](08-what-blocks-selling.md).

---

## Where the API base URL comes from

One rule, in `apps/mobile/lib/api/client.dart`:

1. `--dart-define=API_BASE_URL=…` wins if set.
2. Otherwise, on **web**, the app uses the origin it was served from. The same
   build therefore works on localhost, on a LAN address, and behind a Tailscale
   hostname with no rebuild — which matters, because the URL you install the
   PWA from is usually not the one you developed against.
3. Otherwise, on **native**, it defaults to `http://10.0.2.2:3000` — the
   Android emulator's alias for the host machine.
