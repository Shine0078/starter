import type { PushMessage, PushProvider } from '../../ports/push';

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
