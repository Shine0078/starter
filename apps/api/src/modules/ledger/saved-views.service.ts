import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  isEmptyFilter,
  normalizeViewName,
  toTransactionQuery,
  validateFilter,
  validateName,
  type SavedView,
  type SavedViewFilter,
} from '../../domain/transactions/saved-view';
import type { Transaction } from '../../domain/types';
import {
  CLOCK,
  DuplicateViewNameError,
  SAVED_VIEW_STORE,
  TRANSACTION_STORE,
  type ClockPort,
  type SavedViewStore,
  type TransactionStore,
} from '../../ports';

export interface CreateSavedViewInput {
  name: string;
  filter?: SavedViewFilter;
}

@Injectable()
export class SavedViewsService {
  constructor(
    @Inject(SAVED_VIEW_STORE) private readonly views: SavedViewStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  list(userId: string): Promise<SavedView[]> {
    return this.views.list(userId);
  }

  async create(userId: string, input: CreateSavedViewInput): Promise<SavedView> {
    const filter = input.filter ?? {};

    const nameCheck = validateName(input.name ?? '');
    const filterCheck = validateFilter(filter);

    // Both sets at once: a user fixing a form one rejection at a time gives up.
    const problems = [...nameCheck.problems, ...filterCheck.problems];
    if (problems.length > 0) {
      throw new BadRequestException({ message: 'View rejected.', problems });
    }

    if (isEmptyFilter(filter)) {
      throw new BadRequestException({
        message: 'View rejected.',
        problems: ['Add at least one filter — an unfiltered view is the transaction list.'],
      });
    }

    const view: SavedView = {
      id: randomUUID(),
      name: normalizeViewName(input.name),
      filter,
      createdAt: this.clock.now().toISOString(),
    };

    try {
      return await this.views.create(userId, view);
    } catch (error) {
      if (error instanceof DuplicateViewNameError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.views.remove(userId, id))) {
      throw new NotFoundException('No such view.');
    }
  }

  /**
   * Runs a saved view.
   *
   * The filter goes straight to the same store method the live transaction list
   * uses, so a saved view and a hand-built filter cannot return different rows
   * for the same criteria.
   */
  async apply(
    userId: string,
    id: string,
    limit = 50,
  ): Promise<{ view: SavedView; transactions: Transaction[] }> {
    const view = await this.views.get(userId, id);
    // Scoped by userId, so another user's view id is indistinguishable from a
    // nonexistent one.
    if (!view) throw new NotFoundException('No such view.');

    const transactions = await this.transactions.list(
      userId,
      toTransactionQuery(view.filter, limit),
    );

    return { view, transactions };
  }
}
