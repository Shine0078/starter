import type { Pool } from 'pg';

import type { User } from '../../domain/auth/types';
import {
  DuplicateEmailError,
  type CreateUserInput,
  type RegistrationStore,
} from '../../ports/auth';
import type { ConsentEvent } from '../../ports/privacy';
import { USER_SCOPE_SETTING, withTransaction } from '../postgres/pool';
import { InMemoryUserStore } from './in-memory-auth-stores';
import { InMemoryConsentStore } from '../privacy/consent-stores';

/** Coordinates the two in-memory stores with rollback on any consent failure. */
export class InMemoryRegistrationStore implements RegistrationStore {
  constructor(
    private readonly users: InMemoryUserStore,
    private readonly consents: InMemoryConsentStore,
  ) {}

  async create(input: CreateUserInput, events: ConsentEvent[]): Promise<User> {
    const user = await this.users.create(input);
    try {
      for (const event of events) await this.consents.record(user.id, event);
      return user;
    } catch (error) {
      this.consents.purgeUser(user.id);
      this.users.purgeUser(user.id);
      throw error;
    }
  }
}

interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  display_name: string | null;
  email_verified_at: Date | null;
  status: User['status'];
  created_at: Date;
  deleted_at: Date | null;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email ?? '',
    passwordHash: row.password_hash ?? '',
    displayName: row.display_name,
    emailVerifiedAt: row.email_verified_at,
    status: row.status,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * User creation and legal evidence share one database transaction. A failure
 * cannot leave a usable account whose required acceptance trail is missing.
 */
export class PostgresRegistrationStore implements RegistrationStore {
  constructor(private readonly pg: Pool) {}

  async create(input: CreateUserInput, events: ConsentEvent[]): Promise<User> {
    try {
      return await withTransaction(this.pg, async (client) => {
        const { rows } = await client.query<UserRow>(
          `INSERT INTO users (id, email, password_hash, display_name, status)
           VALUES ($1, $2, $3, $4, 'active')
           RETURNING id,email,password_hash,display_name,email_verified_at,status,created_at,deleted_at`,
          [input.id, input.email, input.passwordHash, input.displayName],
        );

        if (events.length > 0) {
          await client.query('SELECT set_config($1, $2, true)', [
            USER_SCOPE_SETTING,
            input.id,
          ]);
          for (const event of events) {
            if (event.userId !== input.id) {
              throw new Error('Consent owner does not match new user.');
            }
            await client.query(
              `INSERT INTO consent_events
                 (id,user_id,kind,granted,policy_version,source,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [
                event.id,
                input.id,
                event.kind,
                event.granted,
                event.policyVersion,
                event.source,
                event.createdAt,
              ],
            );
          }
        }
        return toUser(rows[0]!);
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }
}
