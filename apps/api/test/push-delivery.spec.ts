import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { FixedClock } from '../src/infra/clock';
import {
  FcmHttpV1PushProvider,
  type FcmFetch,
} from '../src/infra/push/push-providers';
import { InMemoryPushTokenStore } from '../src/infra/push/push-token-stores';
import { PushService } from '../src/modules/push/push.service';
import {
  PushTokenNoLongerValidError,
  type PushProvider,
} from '../src/ports/push';

const DEVICE_TOKEN = 'fcm-device-token-00000000000000000000';

function serviceAccount(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    type: 'service_account',
    project_id: 'finverse-test-project',
    client_email: 'finverse-test@finverse-test-project.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
}

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('FCM HTTP v1 push provider', () => {
  it('exchanges a signed service-account assertion then sends a privacy-safe cross-platform message', async () => {
    const calls: Array<{ url: string; body: string; authorization?: string }> = [];
    const transport: FcmFetch = async (url, init) => {
      calls.push({ url, body: init.body, authorization: init.headers.Authorization });
      return calls.length === 1
        ? response({ access_token: 'test-access-token', expires_in: 3600 })
        : response({ name: 'projects/finverse-test-project/messages/message-1' });
    };
    const provider = FcmHttpV1PushProvider.fromServiceAccountJson(serviceAccount(), {
      transport,
      now: () => 1_786_208_400_000,
    });

    await provider.send(DEVICE_TOKEN, {
      title: 'FINVERSE alert',
      body: 'Open FINVERSE to view an important account alert.',
      data: { notificationId: 'notice-1' },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(calls[0]!.body);
    const assertion = form.get('assertion');
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(assertion).toBeTruthy();
    const [, encodedClaims] = assertion!.split('.');
    expect(JSON.parse(Buffer.from(encodedClaims!, 'base64url').toString())).toMatchObject({
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    });

    expect(calls[1]!.url).toBe(
      'https://fcm.googleapis.com/v1/projects/finverse-test-project/messages:send',
    );
    expect(calls[1]!.authorization).toBe('Bearer test-access-token');
    expect(JSON.parse(calls[1]!.body)).toEqual({
      message: expect.objectContaining({
        token: DEVICE_TOKEN,
        notification: {
          title: 'FINVERSE alert',
          body: 'Open FINVERSE to view an important account alert.',
        },
        data: { notificationId: 'notice-1' },
        android: expect.objectContaining({ priority: 'high' }),
        apns: expect.any(Object),
        webpush: expect.any(Object),
      }),
    });
  });

  it('reuses a still-valid access token and only marks explicit UNREGISTERED targets stale', async () => {
    let requests = 0;
    const transport: FcmFetch = async (_url, _init) => {
      requests += 1;
      if (requests === 1) return response({ access_token: 'test-access-token', expires_in: 3600 });
      if (requests === 2) return response({ name: 'projects/test/messages/one' });
      return response({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, 404);
    };
    const provider = FcmHttpV1PushProvider.fromServiceAccountJson(serviceAccount(), {
      transport,
      now: () => 1_786_208_400_000,
    });
    await provider.send(DEVICE_TOKEN, { title: 'first', body: 'first' });
    await expect(provider.send(DEVICE_TOKEN, { title: 'second', body: 'second' }))
      .rejects.toBeInstanceOf(PushTokenNoLongerValidError);
    // One OAuth request, then two FCM requests: no unnecessary key exchange.
    expect(requests).toBe(3);
  });

  it('rejects incomplete service-account documents without exposing their contents', () => {
    expect(() => FcmHttpV1PushProvider.fromServiceAccountJson('{"private_key":"secret"}'))
      .toThrow('FCM service-account credentials are incomplete.');
  });
});

describe('PushService delivery', () => {
  it('keeps the durable alert path available and deletes only confirmed stale tokens', async () => {
    const tokens = new InMemoryPushTokenStore();
    await tokens.register('user-1', DEVICE_TOKEN, 'android');
    await tokens.register('user-1', `${DEVICE_TOKEN}-stale`, 'ios');
    const sent: string[] = [];
    const provider: PushProvider = {
      name: 'test',
      configured: true,
      send: async (token) => {
        if (token.endsWith('-stale')) throw new PushTokenNoLongerValidError();
        sent.push(token);
      },
    };
    const service = new PushService(tokens, provider, new FixedClock('2026-08-11'));

    await expect(service.deliver('user-1', { title: 'alert', body: 'open app' })).resolves.toEqual({
      attempted: 2,
      delivered: 1,
      removed: 1,
      failed: 0,
    });
    expect(sent).toEqual([DEVICE_TOKEN]);
    expect(await tokens.list('user-1')).toEqual([{ token: DEVICE_TOKEN, platform: 'android' }]);
  });
});
