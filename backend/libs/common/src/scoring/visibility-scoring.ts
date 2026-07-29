import { PromptResult } from '../entities/prompt-result.entity';

export interface CompetitorCitationMetrics {
  competitorMentions: Record<string, number>;
  topCompetitor: string | null;
  citationDomains: string[];
}

// FR9.1 - "no more complex formula is used." Shared by the worker (computed
// once, at scan completion, and persisted onto Scan.visibilityScore) and
// nowhere else - GET /scans/:id always returns the persisted column, never
// recomputes this.
export function computeVisibilityScore(
  results: Pick<PromptResult, 'brandMentioned'>[],
  totalPrompts: number,
): number {
  if (totalPrompts === 0) {
    return 0;
  }
  const brandMentionedCount = results.filter((result) => result.brandMentioned).length;
  return Math.round((brandMentionedCount / totalPrompts) * 100);
}

// FR9.2/FR9.3/FR9.4 - competitorMentions counts per-response appearances (not
// raw text occurrences), topCompetitor is the highest count, citationDomains
// is the de-duplicated union across responses. These are never stored on
// Scan (schemas/prompt-result.md) - both the worker's completion step and the
// API's GET /scans/:id read-time aggregation call this one function, so the
// formula is never re-derived in two places.
export function computeCompetitorCitationMetrics(
  results: Pick<PromptResult, 'competitorsMentioned' | 'citationDomains'>[],
): CompetitorCitationMetrics {
  const competitorMentions: Record<string, number> = {};
  for (const result of results) {
    for (const competitor of result.competitorsMentioned) {
      competitorMentions[competitor] = (competitorMentions[competitor] ?? 0) + 1;
    }
  }

  const topCompetitor =
    Object.entries(competitorMentions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const citationDomains = [...new Set(results.flatMap((result) => result.citationDomains))];

  return { competitorMentions, topCompetitor, citationDomains };
}
