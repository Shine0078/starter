/**
 * Provisioning for the least-privileged runtime role.
 *
 * Row-level security is only worth the bytes it is written in if the connection
 * serving requests cannot bypass it, and both obvious ways to get a database
 * here — docker-compose and the embedded harness — hand out a superuser. So the
 * role that RLS applies to has to be created deliberately.
 *
 * This runs as the schema owner, alongside migrations, and is idempotent: it is
 * safe on every boot and after every deploy. In production, where migrations are
 * a deploy step rather than a startup side effect (MIGRATE_ON_BOOT=false), this
 * runs in the same step and the application's own credentials never need the
 * privilege to create a role.
 */

import type { Pool } from 'pg';

import { withTransaction } from './pool';

export interface AppRoleCredentials {
  role: string;
  password: string;
}

/**
 * Pulls the role and password out of the URL the app will actually connect
 * with, so the two cannot drift apart. A URL whose password is later rotated
 * re-syncs the role on the next deploy rather than locking the app out.
 */
export function parseAppRole(appDatabaseUrl: string): AppRoleCredentials {
  let url: URL;
  try {
    url = new URL(appDatabaseUrl);
  } catch {
    throw new Error('DATABASE_APP_URL is not a valid connection URL.');
  }

  // The URL class percent-decodes nothing for us here; a password containing
  // `@` or `/` has to be encoded in the URL and decoded before it reaches SQL.
  const role = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (!role) throw new Error('DATABASE_APP_URL must include a username.');
  if (!password) {
    throw new Error(
      'DATABASE_APP_URL must include a password. The application role is created ' +
        'with the credentials in that URL, so there is nothing to create it with.',
    );
  }

  return { role, password };
}

/**
 * Creates or updates the runtime role and grants it exactly what the API needs.
 *
 * Explicitly NOSUPERUSER and NOBYPASSRLS. Both are the default for a new role,
 * but they are the two attributes that turn 003_rls.sql into decoration, and a
 * role that acquired either by hand would otherwise be silently accepted here.
 */
export async function provisionAppRole(pg: Pool, appDatabaseUrl: string): Promise<void> {
  const { role, password } = parseAppRole(appDatabaseUrl);

  await withTransaction(pg, async (client) => {
    // A DO block takes no bind parameters, so the credentials are carried in
    // transaction-local settings and quoted by `format` on the way into DDL.
    // Interpolating them into the statement text would be an injection route
    // through an environment variable.
    await client.query('SELECT set_config($1, $2, true), set_config($3, $4, true)', [
      'finverse.bootstrap_role',
      role,
      'finverse.bootstrap_password',
      password,
    ]);

    await client.query(`
      DO $bootstrap$
      DECLARE
        app_role text := current_setting('finverse.bootstrap_role');
        app_pw   text := current_setting('finverse.bootstrap_password');
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
          EXECUTE format('CREATE ROLE %I LOGIN', app_role);
        END IF;

        EXECUTE format(
          'ALTER ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
          app_role, app_pw
        );

        EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), app_role);
        EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);

        -- Read/write on the data, and nothing else. No CREATE on the schema, so
        -- the role cannot shadow finverse_current_user_id() with its own.
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
          app_role
        );
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);

        -- This narrowly scoped SECURITY DEFINER function reveals only the user
        -- and connection IDs required to route a verified provider webhook.
        IF to_regprocedure('public.finverse_link_owner(text)') IS NOT NULL THEN
          EXECUTE format(
            'GRANT EXECUTE ON FUNCTION public.finverse_link_owner(text) TO %I',
            app_role
          );
        END IF;
        IF to_regprocedure('public.finverse_claim_bank_webhooks(integer)') IS NOT NULL THEN
          EXECUTE format(
            'GRANT EXECUTE ON FUNCTION public.finverse_claim_bank_webhooks(integer) TO %I',
            app_role
          );
        END IF;
        IF to_regprocedure('public.finverse_is_split_member(text)') IS NOT NULL THEN
          EXECUTE format(
            'GRANT EXECUTE ON FUNCTION public.finverse_is_split_member(text) TO %I',
            app_role
          );
        END IF;

        -- Tables added by a later migration are covered without anyone having to
        -- remember to come back here.
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
          app_role
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
          app_role
        );

        -- Migration history is the owner's. An application that can rewrite it
        -- can convince the next deploy that a migration already ran. Guarded
        -- because this is also callable against a database with no schema yet.
        IF EXISTS (
          SELECT 1 FROM pg_tables
          WHERE schemaname = 'public' AND tablename = 'schema_migrations'
        ) THEN
          EXECUTE format('REVOKE ALL ON TABLE schema_migrations FROM %I', app_role);
        END IF;
      END
      $bootstrap$;
    `);
  });
}

/** True when the role can be trusted to be subject to the policies. */
export async function isRlsEnforcedFor(pg: Pool, role: string): Promise<boolean> {
  const { rows } = await pg.query<{ enforced: boolean }>(
    'SELECT NOT (rolsuper OR rolbypassrls) AS enforced FROM pg_roles WHERE rolname = $1',
    [role],
  );
  return rows[0]?.enforced ?? false;
}
