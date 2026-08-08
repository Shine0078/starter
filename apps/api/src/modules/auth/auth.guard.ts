import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestContext } from './auth.service';
import { AuthService } from './auth.service';

export const IS_PUBLIC_KEY = 'finverse:isPublic';

/**
 * Opts a route out of authentication.
 *
 * The guard is registered globally, so routes are protected by default and a
 * new controller is safe the moment it is written. The failure mode of the
 * opposite arrangement — protection opt-in — is that forgetting a decorator
 * silently exposes data, and nothing about the code looks wrong.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthenticatedRequest {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string };
  ip?: string;
  auth?: { userId: string; sessionId: string };
}

/** The authenticated user's id. Populated by AuthGuard, never by a client. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  const userId = request.auth?.userId;
  if (!userId) {
    // Reaching here means a route ran without the guard populating identity.
    // Throwing beats returning a fallback id, which is how the old
    // `x-user-id` decorator quietly served everyone the demo account.
    throw new UnauthorizedException('Not authenticated.');
  }
  return userId;
});

export const CurrentSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionId = request.auth?.sessionId;
    if (!sessionId) throw new UnauthorizedException('Not authenticated.');
    return sessionId;
  },
);

export const ReqContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const forwarded = request.headers['x-forwarded-for'];

    // Only trusted when a proxy is in front; behind none, it is client-supplied
    // and is recorded for the audit trail rather than relied upon for security.
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
      request.ip ??
      request.socket?.remoteAddress ??
      null;

    const agent = request.headers['user-agent'];

    return {
      ipAddress: ip,
      userAgent: typeof agent === 'string' ? agent.slice(0, 400) : null,
    };
  },
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];

    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Missing bearer token.');

    // Verifies the signature *and* that the session is still live, so
    // "log out everywhere" takes effect immediately rather than whenever the
    // access token happens to expire.
    const claims = await this.auth.resolveAccessToken(token);
    if (!claims) throw new UnauthorizedException('Invalid or expired token.');

    request.auth = { userId: claims.userId, sessionId: claims.sessionId };
    return true;
  }
}
