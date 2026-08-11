/**
 * Remote push ports.
 *
 * The server stores nothing but an opaque provider device token. Delivery is a
 * provider adapter (FCM for Android, APNs for iOS, or a cross-platform
 * service); until one is configured the adapter reports `configured: false`
 * and the API still accepts registrations so a client that later gains push
 * credentials can register without a server change.
 */

export const PUSH_TOKEN_STORE = 'PUSH_TOKEN_STORE';
export const PUSH_PROVIDER = 'PUSH_PROVIDER';

export type PushPlatform = 'android' | 'ios' | 'web';

export function isPushPlatform(value: unknown): value is PushPlatform {
  return value === 'android' || value === 'ios' || value === 'web';
}

export interface PushTokenStore {
  register(userId: string, token: string, platform: PushPlatform, at: string): Promise<void>;
  unregister(userId: string, token: string): Promise<boolean>;
  purgeUser(userId: string): Promise<void>;
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  readonly name: string;
  /** False until push credentials are configured; delivery then fails closed. */
  readonly configured: boolean;
  send(token: string, message: PushMessage): Promise<void>;
}
