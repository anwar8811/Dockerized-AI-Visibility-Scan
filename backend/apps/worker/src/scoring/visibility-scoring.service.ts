import { Injectable } from '@nestjs/common';
import {
  PromptResult,
  computeVisibilityScore,
  computeCompetitorCitationMetrics,
} from '@app/common';

export interface ScanAggregates {
  visibilityScore: number;
  competitorMentions: Record<string, number>;
  topCompetitor: string | null;
  citationDomains: string[];
}

type ScoringInput = Pick<PromptResult, 'brandMentioned' | 'competitorsMentioned' | 'citationDomains'>;

@Injectable()
export class VisibilityScoringService {
  // One method, one already-loaded set of prompt_result rows in - all four
  // values out. The caller (the processor) is responsible for loading that
  // set with a single query (STORY-018 Technical Notes) - this service only
  // does the arithmetic, so there is exactly one place per formula
  // (visibility-scoring.ts in @app/common) that this and ScansService
  // (apps/api) both call.
  computeAggregates(promptResults: ScoringInput[], totalPrompts: number): ScanAggregates {
    const visibilityScore = computeVisibilityScore(promptResults, totalPrompts);
    const { competitorMentions, topCompetitor, citationDomains } =
      computeCompetitorCitationMetrics(promptResults);

    return { visibilityScore, competitorMentions, topCompetitor, citationDomains };
  }
}
