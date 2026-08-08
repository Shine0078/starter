-- 002_auth — real user identity, sessions, and a security audit trail.
--
-- Replaces the development `x-user-id` header, which trusted whatever string a
-- caller sent and therefore let anyone read anyone's finances.

-- Credentials on the existing users table. `id` stays `text` and now holds a
-- UUID for real accounts. Converting the column to `uuid` would mean dropping
-- and recreating the foreign keys on four tables and deleting every fixture row
-- whose id is not a valid UUID; that is a disruptive migration to buy 20 bytes
-- a row, so it is deliberately deferred.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS password_hash     text,
  ADD COLUMN IF NOT EXISTS display_name      text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz;

-- Case-insensitive uniqueness without depending on the citext extension, which
-- is a contrib module and not guaranteed present on every managed provider.
-- Emails are normalised to lowercase before insert; this index means a path
-- that forgets to normalise collides instead of creating a duplicate account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON users (lower(email))
  WHERE email IS NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_status_valid;
ALTER TABLE users
  ADD CONSTRAINT users_status_valid
  CHECK (status IN ('active', 'locked', 'pending_deletion'));

-- One row per issued refresh token.
--
-- Refresh tokens are single-use and rotate: redeeming one revokes it and issues
-- a successor in the same `family_id`. If a token that was already redeemed
-- comes back, it was captured, and the entire family is revoked — the thief and
-- the victim both get logged out, which is the correct trade.
--
-- Only the SHA-256 of the token is stored. A database leak must not yield
-- usable session credentials.
CREATE TABLE IF NOT EXISTS sessions (
  id            text        PRIMARY KEY,
  user_id       text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id     text        NOT NULL,
  token_hash    text        NOT NULL UNIQUE,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  revoked_reason text,
  user_agent    text,
  ip_address    text
);

CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions (user_id, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS sessions_family_idx
  ON sessions (family_id);

-- Security events, kept separately from application logs so they survive log
-- rotation and can be shown to the user in a privacy dashboard.
--
-- `user_id` is nullable and `email_attempted` is recorded separately: a failed
-- login against an address that does not exist still needs to be counted for
-- brute-force protection, and there is no user row to attach it to.
CREATE TABLE IF NOT EXISTS auth_events (
  id              text        PRIMARY KEY,
  user_id         text        REFERENCES users (id) ON DELETE SET NULL,
  email_attempted text,
  kind            text        NOT NULL,
  succeeded       boolean     NOT NULL,
  ip_address      text,
  user_agent      text,
  detail          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Drives the lockout window. Brute-force counting reads failures for one
-- address over a short period, so the index leads with the address.
CREATE INDEX IF NOT EXISTS auth_events_email_recent_idx
  ON auth_events (lower(email_attempted), created_at DESC)
  WHERE succeeded = false;

CREATE INDEX IF NOT EXISTS auth_events_user_recent_idx
  ON auth_events (user_id, created_at DESC);
