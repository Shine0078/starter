import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Entitlement } from '../../domain/billing/plans';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { BillingService } from './billing.service';

export const ENTITLEMENT_KEY = 'finverse:entitlement';

/**
 * Marks a route as requiring a paid capability.
 *
 * Deliberately opt-in, which is the opposite of how `AuthGuard` is registered.
 * Authentication fails dangerously when forgotten — data leaks — so it defaults
 * on. A missing entitlement check gives a feature away, which is a revenue bug,
 * not a security one, and defaulting every route to "paid" would break the free
 * tier the moment someone added an endpoint.
 */
export const RequiresEntitlement = (entitlement: Entitlement) =>
  SetMetadata(ENTITLEMENT_KEY, entitlement);

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Entitlement | undefined>(ENTITLEMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;
    if (!userId) {
      // AuthGuard runs first and should have rejected this. If the ordering
      // ever changes, refuse rather than treating "no user" as the free tier.
      throw new UnauthorizedException('Authentication is required.');
    }

    // Throws ForbiddenException carrying the plan needed, so the client can
    // show a specific upgrade prompt rather than a generic 403.
    await this.billing.requireEntitlement(userId, required);
    return true;
  }
}
