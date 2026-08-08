/**
 * Credit-card payment guidance based only on fields we actually know.
 *
 * We do not pretend a current balance is a statement balance or invent a
 * minimum payment.  The plan exposes the data needed for a user to decide and
 * clearly labels the useful actions: reduce utilization before the statement
 * closes, and make a payment before—not on—the due date.
 */

import { addDays, addMonths, daysBetweenInclusive, daysInMonth, startOfMonth } from '../dates';
import type { Account } from '../types';

export interface CreditCardPlan {
  accountId: string;
  accountName: string;
  currency: string;
  balanceOwed: number;
  creditLimit: number;
  utilization: number;
  /** Amount needed to reduce utilization to 30%. */
  payDownToThirtyPercent: number;
  /** Full reported current balance. This is not labelled as statement balance. */
  recommendedPayment: number;
  nextStatementDate: string | null;
  paymentDueDate: string | null;
  daysUntilStatement: number | null;
  daysUntilDue: number | null;
  /** The user-facing recommended window, always closing at least 3 days early. */
  safePaymentWindow: { start: string; end: string } | null;
  alerts: string[];
}

function dateForDay(monthStart: string, day: number): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  const clamped = Math.min(day, daysInMonth(year, month));
  return `${monthStart.slice(0, 8)}${String(clamped).padStart(2, '0')}`;
}

/** The next occurrence, including today when it falls on the configured day. */
function nextDayOfMonth(today: string, day: number): string {
  const thisMonth = dateForDay(startOfMonth(today), day);
  return thisMonth >= today ? thisMonth : dateForDay(addMonths(startOfMonth(today), 1), day);
}

function daysUntil(today: string, date: string): number {
  return daysBetweenInclusive(today, date) - 1;
}

export function buildCreditCardPlans(accounts: readonly Account[], today: string): CreditCardPlan[] {
  return accounts
    .filter((account) => account.type === 'credit_card' && (account.creditLimit ?? 0) > 0)
    .map((account) => {
      const creditLimit = account.creditLimit!;
      const balanceOwed = Math.max(0, -account.balanceCurrent);
      const utilization = balanceOwed / creditLimit;
      const payDownToThirtyPercent = Math.max(0, balanceOwed - Math.round(creditLimit * 0.3));
      const nextStatementDate = account.statementDay ? nextDayOfMonth(today, account.statementDay) : null;
      const paymentDueDate = account.paymentDueDay ? nextDayOfMonth(today, account.paymentDueDay) : null;
      const daysUntilStatement = nextStatementDate ? daysUntil(today, nextStatementDate) : null;
      const daysUntilDue = paymentDueDate ? daysUntil(today, paymentDueDate) : null;

      // End three calendar days before the due date. This is an intentional
      // product constraint: never teach people that paying on the due date is
      // a good routine, even if it technically succeeds.
      const earlyEnd = paymentDueDate ? addDays(paymentDueDate, -3) : null;
      const earlyStart = paymentDueDate ? addDays(paymentDueDate, -7) : null;
      const safePaymentWindow =
        earlyEnd && earlyEnd >= today
          ? { start: earlyStart! > today ? earlyStart! : today, end: earlyEnd }
          : null;

      const alerts: string[] = [];
      if (utilization >= 0.9) alerts.push('Critical utilization: pay down this card as soon as possible.');
      else if (utilization >= 0.3) alerts.push('Utilization is above the 30% target.');
      if (daysUntilStatement !== null && daysUntilStatement <= 7) {
        alerts.push(`Statement closes in ${daysUntilStatement} day${daysUntilStatement === 1 ? '' : 's'}.`);
      }
      if (daysUntilDue !== null && daysUntilDue <= 7) {
        alerts.push(
          daysUntilDue === 0
            ? 'Payment is due today—take action immediately; do not wait for the end of day.'
            : `Payment is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`,
        );
      }

      return {
        accountId: account.id,
        accountName: account.name,
        currency: account.currency,
        balanceOwed,
        creditLimit,
        utilization,
        payDownToThirtyPercent,
        // Clearing the currently reported balance is the least ambiguous
        // recommendation we can make without a statement balance or APR.
        recommendedPayment: balanceOwed,
        nextStatementDate,
        paymentDueDate,
        daysUntilStatement,
        daysUntilDue,
        safePaymentWindow,
        alerts,
      };
    })
    .sort((a, b) => b.utilization - a.utilization);
}
