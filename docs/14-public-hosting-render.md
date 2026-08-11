# Public Hosting Without VPN or Tailscale

`render.yaml` and `Dockerfile.public` provide a single-service deployment for
FINVERSE on Render:

- the API and Flutter PWA run in one public HTTPS service;
- the PWA uses same-origin API calls;
- managed PostgreSQL persists data while the owner's computer is offline;
- Render supplies restart/redeploy behavior and the public HTTPS hostname.

This is different from a tunnel: the app does not depend on this workstation,
Tailscale, a home router, or a phone being on the same network.

## Owner Steps

1. Create a Render account and connect the GitHub repository.
2. Create a Blueprint from the repository. Render reads `render.yaml`.
3. Choose a paid web plan and managed PostgreSQL plan. A free/sleeping service
   is not suitable for a financial application.
4. After the database is created, copy its internal connection string and set
   `DATABASE_APP_URL` to the same host/database with username `finverse_app`
   and a new strong password. The pre-deploy migration creates that restricted
   role from `DATABASE_URL`.
5. Set `CORS_ORIGINS` to the final service origin, for example
   `https://finverse.onrender.com`.
6. Supply reviewed HTTPS Terms and Privacy URLs/version IDs, SMTP credentials,
   `MFA_ENCRYPTION_KEY`, and `BANK_TOKEN_ENCRYPTION_KEY`.
7. Deploy and verify:

```text
https://<service>.onrender.com/healthz
https://<service>.onrender.com/app/
```

8. Set Plaid production credentials only after Plaid approves the account.
Register the webhook and web redirect URLs using the final Render hostname.
9. Build native clients with that public origin:

```powershell
flutter build apk --release --dart-define=API_BASE_URL=https://<service>.onrender.com
```

For iOS, configure the same origin in Xcode and complete Apple Universal Link
registration. The PWA works from Safari immediately after the Render deploy.

## Plaid Sandbox Testing

The CIBC screen is Plaid Sandbox. Use Plaid's documented Sandbox credentials,
not a real card number or real bank password:

```text
username: user_good
password: pass_good
```

Sandbox data is synthetic and must not be presented as real bank connectivity.

## Current Limitation

This repository can generate the deployment image and Blueprint, but it cannot
create the Render account, accept billing/legal terms, or supply production
secrets. Those are the exact remaining owner actions.
