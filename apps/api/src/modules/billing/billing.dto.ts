import { IsIn, IsString } from 'class-validator';

import { PURCHASABLE_PLANS } from '../../domain/billing/plans';

export class CreateCheckoutSessionDto {
  /**
   * A plan id, never a price. The server resolves the price from its own
   * configuration — a client that could name a price could name a cheaper one.
   */
  @IsString()
  @IsIn([...PURCHASABLE_PLANS])
  plan!: string;
}
