import { IsIn, IsOptional, IsString } from 'class-validator';

import { BILLING_INTERVALS, PURCHASABLE_PLANS } from '../../domain/billing/plans';

export class CreateCheckoutSessionDto {
  /**
   * A plan id, never a price. The server resolves the price from its own
   * configuration — a client that could name a price could name a cheaper one.
   */
  @IsString()
  @IsIn([...PURCHASABLE_PLANS])
  plan!: string;

  /**
   * Monthly or annual. Also only ever a name: the discount lives on the annual
   * price in Stripe, so the client cannot invent one.
   *
   * Optional, defaulting to monthly, so an older build that predates annual
   * billing keeps working rather than failing validation.
   */
  @IsOptional()
  @IsString()
  @IsIn([...BILLING_INTERVALS])
  interval?: string;
}
