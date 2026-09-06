# FINVERSE: Start Here

FINVERSE is a personal-finance application with a NestJS API, PostgreSQL
persistence and forced row-level security, and a Flutter client for web,
Android, and iOS.

## Current Source Of Truth

1. Read [CURRENT_STATUS.md](CURRENT_STATUS.md) for verified gates and blockers.
2. Read [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for the product and feature map.
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing authentication,
   persistence, imports, or deployment.
4. Use [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) to install, run, and test.
5. Check [KNOWN_ISSUES.md](KNOWN_ISSUES.md) before declaring a release candidate.

Historical handovers are useful investigation records, but they are not current
status. Code, migrations, current Git state, and reproducible tests take
precedence over old prose.

## Important Locations

| Area | Location |
| --- | --- |
| API | `apps/api/src` |
| API tests | `apps/api/test` |
| Database migrations | `apps/api/migrations` |
| Flutter client | `apps/mobile/lib` |
| Flutter tests | `apps/mobile/test` |
| CI and release | `.github/workflows` |
| Deployment | `infra`, `Dockerfile`, `Dockerfile.public` |
| Operations and security docs | `docs` |

## Safety Invariants

- Production serves requests through `DATABASE_APP_URL`, never the schema owner.
- PostgreSQL user data remains protected by enabled and forced RLS.
- Migrations use a separate owner credential and do not run on production boot.
- Financial amounts remain integer minor units with an explicit currency.
- Authentication identity comes from a verified live session, not request fields.
- Uploaded financial documents and derived rows remain user-scoped.
- Release artifacts must be built from the exact SHA that passed required CI.

