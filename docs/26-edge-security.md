# Production edge security

Engineering preparation for CORS/HSTS validation in `Final Goal.md` P1.
Application headers are implemented. The live Cloud Run edge still has to be
checked after the next SHA deploy.

## Code already proven

- Production requires an explicit `CORS_ORIGINS` allowlist
- API responses set `nosniff`, `DENY` framing, `no-store` for `/api/`
- Production sets `strict-transport-security` (`apps/api/test/http-controls.spec.ts`)
- Release Android builds refuse non-HTTPS and the retired Render host

## Live checks after deploying a CI-green SHA

1. `curl -I https://finverse-d6vqs5iu7q-uc.a.run.app/api/readiness` shows HSTS.
2. A browser on a foreign origin cannot read credentialed API responses.
3. `CORS_ORIGINS` equals the canonical Cloud Run origin, not `*`.
4. `/api/version` SHA matches the deployed git SHA.
5. `/app/` is same-origin with the API.

## Still owner-gated

- Custom domain and managed TLS
- Mobile certificate pinning decision
- Cloud Armor / WAF if traffic grows beyond technical beta
