import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Placeholder identity.
 *
 * Phase 1 replaces this with an auth guard resolving a verified session
 * (passkeys / OAuth2 + PKCE — see docs/03-security-privacy.md). Until then the
 * header is a development affordance and MUST NOT survive into a deployed
 * build: it would let any caller read any user's data by guessing an id.
 */
export const DEMO_USER_ID = 'user_demo';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
  const header = request.headers['x-user-id'];
  return typeof header === 'string' && header.length > 0 ? header : DEMO_USER_ID;
});
