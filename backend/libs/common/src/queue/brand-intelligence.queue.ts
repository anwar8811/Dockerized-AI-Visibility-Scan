// Defined exactly once, imported by both the producer (apps/api's
// AutoScansService, STORY-040) and the consumer (apps/worker's
// BrandIntelligenceProcessor, STORY-041) - same pattern as
// prompt-scan.queue.ts, never re-typed as a string literal in a second
// place.

export const BRAND_INTELLIGENCE_QUEUE = 'brand-intelligence';

export const BRAND_INTELLIGENCE_JOB_NAME = 'gather-intelligence';

// One independent, deterministic job per BrandProfile row (KAD-23) - same
// "__" separator convention as buildPromptJobId (prompt-scan.queue.ts),
// since BullMQ hard-rejects a literal ":" in a custom jobId.
export function buildBrandIntelligenceJobId(scanId: string, brandProfileId: string): string {
  return `${scanId}__${brandProfileId}`;
}
