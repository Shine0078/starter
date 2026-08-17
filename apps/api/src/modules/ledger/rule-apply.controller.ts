import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';

import { formatMoney, money } from '../../domain/money';
import type { RulePreview } from '../../domain/categorization/rule-preview';
import { CurrentUser } from '../auth/auth.guard';
import { RuleApplyService, type RuleDraft } from './rule-apply.service';

/** Caps what a preview returns. The counts describe the whole effect; the rows
 *  are a sample, because a 4,000-row preview is not something anyone reads. */
const PREVIEW_SAMPLE = 50;

function present(preview: RulePreview) {
  return {
    matched: preview.matched,
    willChange: preview.changes.length,
    alreadyCorrect: preview.alreadyCorrect,
    protectedByUserChoice: preview.protectedByUserChoice,
    matchesNothing: preview.matchesNothing,
    sample: preview.changes.slice(0, PREVIEW_SAMPLE).map((change) => ({
      ...change,
      amountFormatted: formatMoney(money(change.amount, change.currency)),
    })),
    sampleTruncated: preview.changes.length > PREVIEW_SAMPLE,
  };
}

@Controller('rule-applications')
export class RuleApplyController {
  constructor(private readonly rules: RuleApplyService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const applications = await this.rules.list(userId);
    return { count: applications.length, applications };
  }

  /**
   * Dry run. A POST because the rule travels in the body, but it writes
   * nothing — the point is to see the blast radius before causing it.
   */
  @HttpCode(200)
  @Post('preview')
  async preview(@CurrentUser() userId: string, @Body() body: RuleDraft) {
    return present(await this.rules.preview(userId, body));
  }

  @Post()
  async apply(@CurrentUser() userId: string, @Body() body: RuleDraft) {
    const result = await this.rules.apply(userId, body);
    return { ...result, preview: present(result.preview) };
  }

  /** Restores every changed row to the category it had before. */
  @HttpCode(200)
  @Delete(':id')
  revert(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.rules.revert(userId, id);
  }
}
