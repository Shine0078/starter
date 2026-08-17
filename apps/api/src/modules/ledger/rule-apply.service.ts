import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { isKnownCategory } from '../../domain/categories';
import {
  checkRulePattern,
  previewRule,
  type RulePreview,
} from '../../domain/categorization/rule-preview';
import type { CategorizationRule } from '../../domain/types';
import {
  CLOCK,
  RULE_APPLICATION_STORE,
  TRANSACTION_STORE,
  type ClockPort,
  type RuleApplication,
  type RuleApplicationChange,
  type RuleApplicationStore,
  type TransactionStore,
} from '../../ports';

export interface RuleDraft {
  matchType: CategorizationRule['matchType'];
  pattern: string;
  categorySlug: string;
}

/**
 * A single bulk apply is capped. Beyond this the undo record itself becomes
 * large enough to be slow, and a rule matching this much is more likely to be
 * too broad than genuinely intended.
 */
const MAX_BULK_CHANGES = 5_000;

@Injectable()
export class RuleApplyService {
  constructor(
    @Inject(RULE_APPLICATION_STORE) private readonly applications: RuleApplicationStore,
    @Inject(TRANSACTION_STORE) private readonly transactions: TransactionStore,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /** What the rule would do. Writes nothing. */
  async preview(userId: string, draft: RuleDraft): Promise<RulePreview> {
    this.assertDraft(draft);

    const transactions = await this.transactions.list(userId);
    return previewRule(this.toRule(draft), transactions);
  }

  async apply(userId: string, draft: RuleDraft): Promise<RuleApplication & { preview: RulePreview }> {
    this.assertDraft(draft);

    const transactions = await this.transactions.list(userId);
    const preview = previewRule(this.toRule(draft), transactions);

    if (preview.changes.length === 0) {
      throw new BadRequestException({
        message: 'That rule would change nothing.',
        // The counts explain *why* nothing changed, which is the difference
        // between a typo and a rule that is simply already satisfied.
        matched: preview.matched,
        alreadyCorrect: preview.alreadyCorrect,
        protectedByUserChoice: preview.protectedByUserChoice,
      });
    }

    if (preview.changes.length > MAX_BULK_CHANGES) {
      throw new BadRequestException(
        `That rule would change ${preview.changes.length} transactions, above the ` +
          `${MAX_BULK_CHANGES} limit. Narrow the pattern.`,
      );
    }

    const changes: RuleApplicationChange[] = preview.changes.map((change) => ({
      transactionId: change.transactionId,
      previousCategorySlug: change.fromCategorySlug,
      previousCategorySource: change.fromCategorySource,
      // Recorded from the row itself rather than assumed, so an undo restores
      // the exact confidence the categorizer had.
      previousConfidence:
        transactions.find((t) => t.id === change.transactionId)?.categoryConfidence ?? 0,
    }));

    const application: RuleApplication = {
      id: randomUUID(),
      pattern: draft.pattern.trim(),
      matchType: draft.matchType,
      categorySlug: draft.categorySlug,
      rowsChanged: changes.length,
      createdAt: this.clock.now().toISOString(),
      revertedAt: null,
    };

    const saved = await this.applications.apply(userId, application, changes);
    return { ...saved, preview };
  }

  list(userId: string): Promise<RuleApplication[]> {
    return this.applications.list(userId);
  }

  async revert(userId: string, id: string): Promise<{ restored: number }> {
    const restored = await this.applications.revert(
      userId,
      id,
      this.clock.now().toISOString(),
    );

    if (restored === null) {
      throw new NotFoundException('No such rule application, or it has already been undone.');
    }

    return { restored };
  }

  private toRule(draft: RuleDraft): CategorizationRule {
    return {
      id: 'preview',
      matchType: draft.matchType,
      pattern: draft.pattern.trim(),
      categorySlug: draft.categorySlug,
      priority: 0,
    };
  }

  private assertDraft(draft: RuleDraft): void {
    const check = checkRulePattern(draft.matchType, draft.pattern ?? '');
    if (!check.ok) {
      throw new BadRequestException({ message: 'Rule rejected.', problems: check.problems });
    }

    if (!isKnownCategory(draft.categorySlug)) {
      throw new BadRequestException(`Unknown category "${draft.categorySlug}".`);
    }
  }
}
