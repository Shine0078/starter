# FINVERSE Architecture

## Runtime Shape

FINVERSE is a modular monolith. The Flutter client calls a NestJS API. The API
separates pure financial domain logic, service modules, ports, and in-memory or
PostgreSQL adapters. Production may serve the Flutter web bundle at `/app/` from
the same origin.

```text
Flutter web / Android / iOS
            |
      HTTPS JSON API
            |
NestJS guards, validation, modules
            |
domain logic -> ports -> PostgreSQL adapters
                         |
              restricted runtime role + forced RLS
```

## Trust Boundaries

- The global auth guard protects routes unless a route is explicitly public.
- Access JWTs identify a server-side session; revocation and account status are
  checked on authenticated requests.
- Refresh credentials are opaque, hashed at rest, rotated once, and protected
  against family replay.
- WebAuthn challenges are shared, expiring, purpose-bound, and atomically
  consumed. A narrow database function resolves the credential owner before the
  service re-enters an ordinary user scope.
- `withUserScope` creates a transaction and sets `finverse.user_id` locally.
  User-owned tables also use explicit ownership predicates and forced RLS.
- Schema changes and runtime-role provisioning use `DATABASE_URL`; serving uses
  `DATABASE_APP_URL` and production startup verifies that role is restricted.
- Native offline payloads use AES-GCM with an owner-bound context and a key held
  in secure storage. Flutter web deliberately has no persistent financial cache.

## Data And Money

- Monetary values are integer minor units and are never combined across
  currencies without an explicit conversion rate.
- Accounts, transactions, budgets, goals, imports, receipts, notifications, and
  authentication records are user-scoped.
- Split groups are membership-scoped shared records and therefore require their
  own actor, invitation, consent, and audit rules.
- Manual statement rows remain staged until the user resolves uncertainty and
  approves them into the ledger.

## Deployment Paths

- Local development can use volatile in-memory adapters.
- `render.yaml` is preview/development only.
- Oracle Compose and Cloud Run separate migrations from the serving process.
- GitHub release workflows bind artifacts to an exact successful-CI SHA and
  generate container provenance and an SBOM.

See `docs/01-architecture.md`, `docs/03-security-privacy.md`, and the ADRs under
`docs/adr` for detailed design history. Current code and migrations win when a
historical ADR no longer describes all tables or adapters.

