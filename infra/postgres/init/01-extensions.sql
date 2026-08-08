-- Runs only when the Postgres data volume is first created.
--
-- The schema itself is owned by apps/api/migrations — do not add tables here.
-- This file exists solely for extensions that later migrations assume, and for
-- anything that needs superuser rights the application role may not have.
--
--   pg_trgm  : trigram index for fuzzy merchant/descriptor search
--   citext   : case-insensitive email column (Phase 1 identity)
--   uuid-ossp: server-side uuid generation (Phase 1 identity)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
