import { addDays, assertIsoDate } from '../dates';
import type { Account, Transaction } from '../types';
import { forecastCashFlow, type CashFlowForecast, type ForecastPoint } from './cash-flow-forecast';

export interface PurchaseScenario {
  asOf: string;
  currency: string;
  purchase: { amount: number; date: string };
  baseline: CashFlowForecast;
  points: ForecastPoint[];
  balanceBeforePurchase: number;
  balanceAfterPurchase: number;
  endingBalance: number;
  lowBalanceDates: string[];
  warnings: string[];
}

/**
 * Models a single optional purchase against the same conservative cash-flow
 * baseline the app presents elsewhere. It is intentionally not a financial
 * recommendation: normal discretionary spending is excluded from the base
 * forecast, so a non-negative result only means known recurring commitments
 * are covered.
 */
export function simulatePurchase(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  asOf: string,
  days: number,
  amount: number,
  purchaseDate: string,
  currency = 'USD',
): PurchaseScenario {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Purchase amount must be a positive integer in minor units');
  }
  assertIsoDate(purchaseDate);

  const baseline = forecastCashFlow(accounts, transactions, asOf, days, currency);
  const firstDate = addDays(asOf, 1);
  const lastDate = baseline.points[baseline.points.length - 1]?.date;
  if (!lastDate || purchaseDate < firstDate || purchaseDate > lastDate) {
    throw new Error(`Purchase date must be from ${firstDate} through ${lastDate}`);
  }

  const basePoint = baseline.points.find((point) => point.date === purchaseDate)!;
  const points = baseline.points.map((point) => ({
    ...point,
    balance: point.date >= purchaseDate ? point.balance - amount : point.balance,
  }));
  const balanceAfterPurchase = basePoint.balance - amount;
  const endingBalance = points[points.length - 1]!.balance;
  const lowBalanceDates = points.filter((point) => point.balance < 0).map((point) => point.date);
  const warnings = [
    'This scenario includes repeatable income and bills only; it does not predict everyday discretionary spending.',
  ];
  if (balanceAfterPurchase < 0) {
    warnings.unshift('This purchase creates a projected cash shortfall on its purchase date.');
  } else if (lowBalanceDates.length) {
    warnings.unshift('This purchase creates a projected cash shortfall later in the selected horizon.');
  } else {
    warnings.unshift('Known recurring commitments remain covered in this conservative scenario.');
  }

  return {
    asOf,
    currency,
    purchase: { amount, date: purchaseDate },
    baseline,
    points,
    balanceBeforePurchase: basePoint.balance,
    balanceAfterPurchase,
    endingBalance,
    lowBalanceDates,
    warnings,
  };
}
