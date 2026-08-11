import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import type { WebAuthnConfig } from '../../config';
import type { PublicUser } from '../../domain/auth/types';
import { base64UrlDecode, base64UrlEncode } from '../../domain/webauthn/verify';
import { CLOCK, type ClockPort } from '../../ports';
import { USER_STORE, type UserStore } from '../../ports/auth';
import {
  WEBAUTHN_CONFIG,
  WEBAUTHN_CREDENTIAL_STORE,
  WEBAUTHN_VERIFIER,
  type WebAuthnCredentialStore,
  type WebAuthnVerifier,
} from '../../ports/webauthn';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class WebAuthnService {
  private readonly pendingChallenges = new Map<
    string,
    { challenge: string; expiresAt: number }
  >();

  constructor(
    @Inject(WEBAUTHN_VERIFIER) private readonly verifier: WebAuthnVerifier,
    @Inject(WEBAUTHN_CREDENTIAL_STORE) private readonly credentials: WebAuthnCredentialStore,
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(WEBAUTHN_CONFIG) private readonly config: WebAuthnConfig | null,
  ) {}

  get available(): boolean {
    return this.verifier.configured && this.config !== null;
  }

  private requireConfig(): WebAuthnConfig {
    if (!this.available) {
      throw new ServiceUnavailableException(
        'Passkeys are not enabled on this server yet.',
      );
    }
    return this.config!;
  }

  private issueChallenge(key: string): string {
    const challenge = base64UrlEncode(randomBytes(32));
    this.pendingChallenges.set(key, {
      challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
    return challenge;
  }

  private takeChallenge(key: string): string | null {
    const pending = this.pendingChallenges.get(key);
    if (!pending) return null;
    this.pendingChallenges.delete(key);
    if (pending.expiresAt < Date.now()) return null;
    return pending.challenge;
  }

  /** Issue a registration ceremony for a signed-in user. */
  async registrationOptions(user: PublicUser): Promise<Record<string, unknown>> {
    const config = this.requireConfig();
    const challenge = this.issueChallenge(`register:${user.id}`);
    return {
      rp: { id: config.rpId, name: config.rpName },
      user: {
        id: base64UrlEncode(Buffer.from(user.id)),
        name: user.email,
        displayName: user.displayName ?? user.email,
      },
      challenge,
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60_000,
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    };
  }

  async registrationVerify(
    userId: string,
    body: {
      id: string;
      response: { clientDataJSON: string; attestationObject: string };
    },
  ): Promise<{ credentialId: string }> {
    this.requireConfig();
    const challenge = this.takeChallenge(`register:${userId}`);
    if (!challenge) throw new NotFoundException('Start passkey setup again.');
    const verified = await this.verifier.verifyRegistration({
      clientDataJson: base64UrlDecode(body.response.clientDataJSON),
      attestationObject: base64UrlDecode(body.response.attestationObject),
      expectedChallenge: challenge,
    });
    await this.credentials.register(
      userId,
      {
        credentialId: verified.credentialId,
        publicKeyPem: verified.publicKeyPem,
        counter: 0,
        createdAt: this.clock.now().toISOString(),
        lastUsedAt: null,
      },
      this.clock.now().toISOString(),
    );
    return { credentialId: verified.credentialId };
  }

  /** Issue a login ceremony. With an email we can hint allowed credentials. */
  async loginOptions(email?: string): Promise<Record<string, unknown>> {
    const config = this.requireConfig();
    const challenge = this.issueChallenge(`login:${email ?? 'anonymous'}`);
    let allowed: unknown[] | undefined;
    if (email) {
      const user = await this.users.findByEmail(email.toLowerCase().trim());
      if (user) {
        const rows = await this.credentials.list(user.id);
        allowed = rows.map((row) => ({ type: 'public-key', id: row.credentialId }));
      }
    }
    return {
      rp: { id: config.rpId, name: config.rpName },
      challenge,
      timeout: 60_000,
      userVerification: 'preferred',
      ...(allowed ? { allowCredentials: allowed } : {}),
    };
  }

  async loginVerify(
    body: {
      id: string;
      response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
      };
    },
    email?: string,
  ): Promise<{ userId: string; credentialId: string }> {
    this.requireConfig();
    const challenge = this.takeChallenge(`login:${email ?? 'anonymous'}`);
    if (!challenge) throw new NotFoundException('Sign in again to continue.');

    const owned = await this.credentials.findByCredentialId(body.id);
    if (!owned) throw new NotFoundException('This passkey is not registered.');
    if (email) {
      const user = await this.users.findByEmail(email.toLowerCase().trim());
      if (!user || user.id !== owned.userId) {
        throw new NotFoundException('This passkey is not registered.');
      }
    }

    const counter = this.readCounter(body.response.authenticatorData);
    await this.verifier.verifyAuthentication({
      clientDataJson: base64UrlDecode(body.response.clientDataJSON),
      authenticatorData: base64UrlDecode(body.response.authenticatorData),
      signature: base64UrlDecode(body.response.signature),
      expectedChallenge: challenge,
      credentialId: body.id,
      publicKeyPem: owned.credential.publicKeyPem,
    });
    // A sign-counter regression is a cloned-key signal; fail the login.
    if (owned.credential.counter > 0 && counter <= owned.credential.counter) {
      throw new NotFoundException('This passkey could not be verified.');
    }
    await this.credentials.updateCounter(owned.userId, body.id, counter);
    return { userId: owned.userId, credentialId: body.id };
  }

  async listCredentials(userId: string) {
    const rows = await this.credentials.list(userId);
    return rows.map((row) => ({
      credentialId: row.credentialId,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    }));
  }

  async removeCredential(userId: string, credentialId: string): Promise<boolean> {
    return this.credentials.remove(userId, credentialId);
  }

  private readCounter(authenticatorDataB64: string): number {
    return base64UrlDecode(authenticatorDataB64).readUInt32BE(33);
  }
}
