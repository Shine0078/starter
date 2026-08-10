# Run FINVERSE on your phone

FINVERSE is a Flutter app with Android, iOS, and installable web targets. The
API origin is configuration, not a private-network assumption:

```text
--dart-define=API_BASE_URL=https://api.example.com
```

Use a real public HTTPS API for a phone build. The release workflow reads the
same value from the CI `API_BASE_URL` variable. Do not commit a secret, a LAN
address, or a private tunnel hostname.

## Android emulator (local development)

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter\apps\mobile
flutter run -d finverse_pixel
```

The default native development origin is `http://10.0.2.2:3000`, which is the
Android emulator alias for the Windows host. Start the API separately:

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter
npm run dev --workspace @finverse/api
```

For a physical phone, build with an HTTPS origin:

```powershell
flutter build apk --release `
  --dart-define=API_BASE_URL=https://api.example.com
```

## iPhone and iOS simulator

The iOS simulator uses `http://127.0.0.1:3000` by default. A physical iPhone
must be built with `API_BASE_URL` set to the deployed HTTPS API (or a local
HTTPS development proxy on the same Wi-Fi). No VPN client is required.

For Windows same-Wi-Fi debug testing, the API listens on all interfaces and the
repository includes `apps/mobile/run-ios-lan.ps1`, which prints the computer's
usable LAN origins and matching Flutter commands. This is a development-only
HTTP path; test the printed `/healthz` URL in iPhone Safari and allow Node.js on
the Windows Private firewall profile if necessary. Release builds reject
loopback origins and require a reachable HTTPS API.

The PWA is the free Windows-to-iPhone route:

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter\apps\mobile
flutter build web --release --base-href=/app/ `
  --dart-define=API_BASE_URL=https://api.example.com
```

Deploy `build/web` at `/app/` on the same host as the API, open the HTTPS URL
in Safari, then choose **Share → Add to Home Screen**. Plaid Link for Web is
available in the PWA; the native app lock and encrypted offline cache are
available in the Android/iOS binaries.

## Plaid Sandbox

The server adapter supports Plaid Sandbox, encrypted access-token storage,
cursor-based `/transactions/sync`, pending-to-posted updates, removed rows,
webhook retry, reconnect, and multiple institutions. Configure the keys only
in `apps/api/.env` or the deployment secret manager:

On Windows, the repository includes a one-time loopback helper so the secret
never appears in a shell command or in Git:

```powershell
cd C:\Users\samue\OneDrive\Desktop\starter
npm run plaid:configure --workspace @finverse/api
```

Open the private URL it prints, paste the Sandbox Client ID and secret from
Plaid **Developers → Keys**, submit it, then restart the API and Android
Studio. The helper stores user-level development variables and generates the
bank-token encryption key locally.

```text
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENVIRONMENT=sandbox
PLAID_COUNTRIES=CA,US
BANK_TOKEN_ENCRYPTION_KEY=<base64 for 32 random bytes>
```

Restart the API, sign in, open **Accounts → Connect bank**, and complete Link
with Plaid's Sandbox test institution credentials. Sandbox data is synthetic;
real institutions require Plaid production approval and a commercial account.

## What is platform-specific

| Capability | Web/PWA | Android | iOS native |
|---|---:|---:|---:|
| Plaid Link | Yes (JavaScript SDK) | Yes (native SDK) | LinkKit bridge wired; Mac/Xcode smoke test pending |
| Secure session storage | Origin storage limitations | Android Keystore | iOS Keychain |
| Encrypted offline cache | Not available | SQLite + AES-GCM | SQLite + AES-GCM |
| Device app lock | Not available | Biometrics/PIN | Face ID/Touch ID/PIN |

The checked-in iOS project includes Plaid LinkKit 7 through Swift Package
Manager and the Flutter method-channel bridge. Building or signing it requires
macOS/Xcode and an Apple team; Windows cannot run that toolchain. Before an
OAuth bank test, set `PLAID_IOS_REDIRECT_URI` to a registered Universal Link,
add the matching Associated Domains entitlement, and host the
`apple-app-site-association` file for `com.finverse.finance`. The API now fails
closed with an actionable error if native iOS Link is requested without that
redirect configuration.

## Troubleshooting

- **Connection refused on Android emulator:** confirm the API is running on
  port 3000 and leave the default `10.0.2.2` origin in place.
- **Connection refused on a physical phone:** rebuild with a reachable HTTPS
  `API_BASE_URL`; `localhost` means the phone itself.
- **Plaid says Link is not configured:** verify the server has both Sandbox
  keys and `BANK_TOKEN_ENCRYPTION_KEY`, then restart it.
- **A returning user sees sign-in:** the app rotates refresh tokens in the
  server-backed session store. If the session was revoked or the refresh token
  expired, sign in again; all cached finance data is purged on sign-out.

## Data safety reminder

`/app/` is the product and starts empty for a new user. The development-only
`/dev/` dashboard can run the deterministic mock aggregator for demonstrations;
it is not a bank connection and is refused when `NODE_ENV=production`.
