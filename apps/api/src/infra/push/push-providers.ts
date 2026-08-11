import { createSign } from 'node:crypto';

import {
  PushTokenNoLongerValidError,
  type PushMessage,
  type PushProvider,
} from '../../ports/push';

/**
 * No push provider is configured yet. Delivery fails closed so a deploy can
 * never silently claim notifications were sent; the API still records device
 * tokens so the moment credentials arrive, clients are already registered.
 */
export class UnconfiguredPushProvider implements PushProvider {
  readonly name = 'unconfigured';
  readonly configured = false;

  send(_token: string, _message: PushMessage): Promise<void> {
    return Promise.reject(new Error('Push delivery is not configured on this server.'));
  }
}

interface FcmServiceAccount {
  type: 'service_account';
  project_id: string;
  client_email: string;
  private_key: string;
}

interface FcmHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FcmFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<FcmHttpResponse>;

interface AccessToken {
  value: string;
  /** Unix milliseconds at which an auth token must no longer be reused. */
  expiresAt: number;
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const AUTH_TIMEOUT_MS = 10_000;

/**
 * Direct FCM HTTP v1 adapter.
 *
 * It implements the service-account OAuth flow with Node's built-in crypto so
 * the finance API does not pull Firebase's database/auth SDKs into its trusted
 * server dependency tree. FCM routes APNs payloads for iOS registrations after
 * the owner completes the Apple key/certificate setup in Firebase.
 */
export class FcmHttpV1PushProvider implements PushProvider {
  readonly name = 'fcm-http-v1';
  readonly configured = true;
  private token: AccessToken | undefined;
  private tokenInFlight: Promise<AccessToken> | undefined;

  constructor(
    private readonly account: FcmServiceAccount,
    private readonly transport: FcmFetch = defaultFetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  static fromServiceAccountJson(
    serialized: string,
    options?: { transport?: FcmFetch; now?: () => number },
  ): FcmHttpV1PushProvider {
    return new FcmHttpV1PushProvider(
      parseServiceAccount(serialized),
      options?.transport,
      options?.now,
    );
  }

  async send(token: string, message: PushMessage): Promise<void> {
    const accessToken = await this.accessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      const response = await this.transport(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.project_id)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: message.data,
              android: {
                priority: 'high',
                notification: {
                  channel_id: 'finverse-financial-alerts',
                  sound: 'default',
                },
              },
              apns: {
                headers: { 'apns-priority': '10' },
                payload: {
                  aps: {
                    sound: 'default',
                    'thread-id': 'finverse-financial-alerts',
                  },
                },
              },
              webpush: { headers: { Urgency: 'high' } },
            },
          }),
          signal: controller.signal,
        },
      );
      if (response.ok) return;

      // FCM's structured error body includes UNREGISTERED for a token that is
      // no longer usable. Only that explicit signal is eligible for deletion.
      const body = await response.text().catch(() => '');
      if (body.includes('UNREGISTERED')) {
        throw new PushTokenNoLongerValidError();
      }
      throw new Error(`FCM delivery request failed (${response.status}).`);
    } catch (error) {
      if (error instanceof PushTokenNoLongerValidError) throw error;
      if (isAbort(error)) throw new Error('FCM delivery request timed out.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    if (!this.tokenInFlight) {
      this.tokenInFlight = this.requestAccessToken().finally(() => {
        this.tokenInFlight = undefined;
      });
    }
    const token = await this.tokenInFlight;
    this.token = token;
    return token.value;
  }

  private async requestAccessToken(): Promise<AccessToken> {
    const issuedAtSeconds = Math.floor(this.now() / 1_000);
    const assertion = signJwt(
      this.account.private_key,
      {
        iss: this.account.client_email,
        scope: FCM_SCOPE,
        aud: TOKEN_ENDPOINT,
        iat: issuedAtSeconds,
        exp: issuedAtSeconds + 3_600,
      },
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      const response = await this.transport(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.text().catch(() => '');
        throw new Error(`FCM credential exchange failed (${response.status}).`);
      }
      const payload = await response.json();
      const record = isRecord(payload) ? payload : undefined;
      const value = record?.access_token;
      const expiresIn = record?.expires_in;
      if (typeof value !== 'string' || !value || typeof expiresIn !== 'number' || expiresIn < 60) {
        throw new Error('FCM credential exchange returned an invalid token response.');
      }
      // Refresh one minute early so a slow provider call never begins with an
      // already-expired credential.
      return { value, expiresAt: this.now() + (expiresIn - 60) * 1_000 };
    } catch (error) {
      if (isAbort(error)) throw new Error('FCM credential exchange timed out.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseServiceAccount(serialized: string): FcmServiceAccount {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('FCM service-account credentials are invalid.');
  }
  if (!isRecord(value) ||
      value.type !== 'service_account' ||
      typeof value.project_id !== 'string' || !value.project_id ||
      typeof value.client_email !== 'string' || !value.client_email ||
      typeof value.private_key !== 'string' || !value.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('FCM service-account credentials are incomplete.');
  }
  return {
    type: 'service_account',
    project_id: value.project_id,
    client_email: value.client_email,
    private_key: value.private_key,
  };
}

function signJwt(privateKey: string, claims: Record<string, string | number>): string {
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64UrlJson(claims);
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

const defaultFetch: FcmFetch = (url, init) => fetch(url, init);
