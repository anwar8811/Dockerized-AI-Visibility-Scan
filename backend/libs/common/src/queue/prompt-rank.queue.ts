// Defined exactly once, imported by both the producer (apps/api's
// ScanAnalysisService, STORY-045) and the consumer (apps/worker's
// PromptRankProcessor, STORY-046) - same pattern as prompt-scan.queue.ts
// and brand-intelligence.queue.ts.

export const PROMPT_RANK_QUEUE = 'prompt-rank';

export const PROMPT_RANK_JOB_NAME = 'rank-prompt';

// Same "__" separator convention as buildPromptJobId/buildBrandIntelligenceJobId -
// no collision with either, since each lives on its own queue.
export function buildPromptRankJobId(scanId: string, promptId: string): string {
  return `${scanId}__${promptId}`;
}
