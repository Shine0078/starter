-- Extensions the schema depends on.
--   pg_trgm  : trigram index for fuzzy merchant/descriptor search
--   citext   : case-insensitive email column
--   uuid-ossp: uuid generation server-side
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
