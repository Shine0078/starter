import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import type { WebAuthnConfig } from '../../config';
import { normalizeEmail } from '../../domain/auth/password-policy';
import type { PublicUser } from '../../domain/auth/types';
import { base64UrlDecode, base64UrlEncode } from '../../domain/webauthn/verify';
import {
  WEBAUTHN_CHALLENGE_STORE,
  type WebAuthnChallengeStore,
} from '../../infra/webauthn/webauthn-challenge-stores';
import { CLOCK, type ClockPort } from '../../ports';
import { USER_STORE, type UserStore } from '../../ports/auth';
import {
  WEBAUTHN_CONFIG,
  WEBAUTHN_CREDENTIAL_STORE,
  WEBAUTHN_VERIFIER,
  type WebAuthnCredentialStore,
  type WebAuthnVerifier,
} from '../../ports/webauthn';
import { AuthService, type AuthResult, type RequestContext } from '../auth/auth.service';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const FAILED_LOGIN = 'This passkey could not be verified.';

@Injectable()
export class WebAuthnService {
  constructor(
    @Inject(WEBAUTHN_VERIFIER) private readonly verifier: WebAuthnVerifier,
    @Inject(WEBAUTHN_CREDENTIAL_STORE) private readonly credentials: WebAuthnCredentialStore,
    @Inject(WEBAUTHN_CHALLENGE_STORE) private readonly challenges: WebAuthnChallengeStore,
    @Inject(USER_STORE) private readonly users: UserStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(WEBAUTHN_CONFIG) private readonly config: WebAuthnConfig | null,
    private readonly auth: AuthService,
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

  private async issueCeremony(
    purpose: 'register' | 'login',
    userId?: string | null,
    emailAttempted?: string | null,
  ): Promise<{ ceremonyId: string; challenge: string }> {
    const ceremonyId = randomBytes(32).toString('base64url');
    const challenge = base64UrlEncode(randomBytes(32));
    const now = this.clock.now();
    await this.challenges.issue({
      ceremonyId,
      challenge,
      purpose,
      userId: userId ?? null,
      emailAttempted: emailAttempted ?? null,
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
      createdAt: now,
    });
    return { ceremonyId, challenge };
  }

  async registrationOptions(user: PublicUser): Promise<Record<string, unknown>> {
    const config = this.requireConfig();
    const { ceremonyId, challenge } = await this.issueCeremony('register', user.id, user.email);
    const existing = await this.credentials.list(user.id);
    return {
      ceremonyId,
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
        residentKey: 'required',
        userVerification: 'required',
      },
      excludeCredentials: existing.map((row) => ({
        type: 'public-key',
        id: row.credentialId,
      })),
    };
  }

  async registrationVerify(
    userId: string,
    body: {
      id: string;
      ceremonyId: string;
      response: { clientDataJSON: string; attestationObject: string };
    },
    context: RequestContext,
  ): Promise<{ credentialId: string }> {
    this.requireConfig();
    const ceremony = await this.challenges.consume(body.ceremonyId, 'register', this.clock.now());
    if (!ceremony || ceremony.userId !== userId) {
      throw new NotFoundException('Start passkey setup again.');
    }
    let verified: { credentialId: string; publicKeyPem: string };
    try {
      verified = await this.verifier.verifyRegistration({
        clientDataJson: base64UrlDecode(body.response.clientDataJSON),
        attestationObject: base64UrlDecode(body.response.attestationObject),
        expectedChallenge: ceremony.challenge,
      });
    } catch {
      throw new NotFoundException('Start passkey setup again.');
    }
    if (verified.credentialId !== body.id) {
      throw new NotFoundException('Start passkey setup again.');
    }
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
    const user = await this.users.findById(userId);
    await this.auth.recordAuthEvent(
      'passkey_registered',
      true,
      userId,
      user?.email ?? null,
      context,
      null,
    );
    if (user?.email) await this.auth.notifyPasskeyChange(user.email, 'added');
    return { credentialId: verified.credentialId };
  }

  async loginOptions(email?: string): Promise<Record<string, unknown>> {
    const config = this.requireConfig();
    const normalized = email ? normalizeEmail(email) : null;
    const user = normalized ? await this.users.findByEmail(normalized) : null;
    const { ceremonyId, challenge } = await this.issueCeremony(
      'login',
      user?.id ?? null,
      normalized,
    );
    return {
      ceremonyId,
      rp: { id: config.rpId, name: config.rpName },
      challenge,
      timeout: 60_000,
      userVerification: 'required',
    };
  }

  async loginVerify(
    body: {
      id: string;
      ceremonyId: string;
      response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
      };
    },
    context: RequestContext,
  ): Promise<AuthResult> {
    this.requireConfig();
    const ceremony = await this.challenges.consume(body.ceremonyId, 'login', this.clock.now());
    if (!ceremony) throw new UnauthorizedException(FAILED_LOGIN);

    const owned = await this.credentials.findByCredentialId(body.id);
    const owner = owned ? await this.users.findById(owned.userId) : null;
    const ownerEmail = owner?.email ?? ceremony.emailAttempted;
    if (owned) await this.auth.assertPasskeyNotLocked(ownerEmail, context);
    if (!owned || (ceremony.userId && ceremony.userId !== owned.userId)) {
      await this.auth.recordAuthEvent(
        'passkey_login',
        false,
        ceremony.userId,
        ceremony.emailAttempted,
        context,
        'unknown credential',
      );
      throw new UnauthorizedException(FAILED_LOGIN);
    }

    try {
      await this.verifier.verifyAuthentication({
        clientDataJson: base64UrlDecode(body.response.clientDataJSON),
        authenticatorData: base64UrlDecode(body.response.authenticatorData),
        signature: base64UrlDecode(body.response.signature),
        expectedChallenge: ceremony.challenge,
        credentialId: body.id,
        publicKeyPem: owned.credential.publicKeyPem,
      });
      await this.credentials.updateCounter(
        owned.userId,
        body.id,
        this.readCounter(body.response.authenticatorData),
      );
    } catch {
      await this.auth.recordAuthEvent(
        'passkey_login',
        false,
        owned.userId,
        ownerEmail,
        context,
        'assertion failed',
      );
      throw new UnauthorizedException(FAILED_LOGIN);
    }

    return this.auth.loginWithVerifiedPasskey(owned.userId, context);
  }

  async listCredentials(userId: string) {
    const rows = await this.credentials.list(userId);
    return rows.map((row) => ({
      credentialId: row.credentialId,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    }));
  }

  async removeCredential(
    userId: string,
    credentialId: string,
    context: RequestContext,
  ): Promise<boolean> {
    const removed = await this.credentials.remove(userId, credentialId);
    const user = await this.users.findById(userId);
    await this.auth.recordAuthEvent(
      'passkey_removed',
      removed,
      userId,
      user?.email ?? null,
      context,
      removed ? null : 'unknown credential',
    );
    if (removed && user?.email) await this.auth.notifyPasskeyChange(user.email, 'removed');
    return removed;
  }

  private readCounter(authenticatorDataB64: string): number {
    return base64UrlDecode(authenticatorDataB64).readUInt32BE(33);
  }
}
