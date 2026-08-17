import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import { CurrentUser } from '../auth/auth.guard';
import {
  ReconciliationService,
  type CreateReconciliationInput,
  type ReconciliationView,
} from './reconciliation.service';

/** Amounts travel as integers for arithmetic and as strings for display, so the
 *  client never re-derives currency formatting (ADR-0003). */
function present(row: ReconciliationView) {
  return {
    ...row,
    observedFormatted: formatMoney(money(row.observedBalance, row.currency)),
    computedFormatted: formatMoney(money(row.computedBalance, row.currency)),
    differenceFormatted: formatMoney(money(row.difference, row.currency)),
  };
}

@Controller('reconciliations')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get()
  async list(@CurrentUser() userId: string, @Query('account') accountId?: string) {
    const rows = await this.reconciliation.list(userId, accountId);
    return { count: rows.length, reconciliations: rows.map(present) };
  }

  /** Which accounts have drifted out of date, and by how much last time. */
  @Get('summary')
  async summary(@CurrentUser() userId: string) {
    const accounts = await this.reconciliation.summary(userId);
    return {
      count: accounts.length,
      overdue: accounts.filter((a) => a.overdue).length,
      accounts: accounts.map((account) => ({
        ...account,
        currentBalanceFormatted: formatMoney(money(account.currentBalance, account.currency)),
        lastDifferenceFormatted:
          account.lastDifference === null
            ? null
            : formatMoney(money(account.lastDifference, account.currency)),
      })),
    };
  }

  /**
   * Shows what the comparison would say without recording it.
   *
   * Deliberately a GET with no side effect: an audit trail littered with
   * speculative entries is worse than no audit trail, because it looks complete.
   */
  @Get('preview')
  async preview(
    @CurrentUser() userId: string,
    @Query('account') accountId: string,
    @Query('statementDate') statementDate: string,
    @Query('observedBalance') observedBalance: string,
  ) {
    const outcome = await this.reconciliation.preview(
      userId,
      accountId,
      statementDate,
      Number(observedBalance),
    );

    return {
      ...outcome,
      computedFormatted: formatMoney(money(outcome.computedBalance, outcome.currency)),
      differenceFormatted: formatMoney(money(outcome.difference, outcome.currency)),
    };
  }

  @Post()
  async create(@CurrentUser() userId: string, @Body() body: CreateReconciliationInput) {
    return present(await this.reconciliation.create(userId, body));
  }

  /** Withdraws an assertion. Archived, never deleted — see 023. */
  @Delete(':id')
  @HttpCode(204)
  async archive(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.reconciliation.archive(userId, id);
  }
}
