// Defined exactly once, imported by both the producer (apps/api,
// STORY-009) and the consumer (apps/worker, STORY-010) - never re-typed
// as a string literal in a second place, so the two sides can never
// silently drift apart.

export const PROMPT_SCAN_QUEUE = 'prompt-scan';

export const PROMPT_SCAN_JOB_NAME = 'process-prompt';

// The brief's example job-id format (§13) is "scanId:promptId" - but
// BullMQ hard-rejects any custom jobId containing a colon ("Custom Id
// cannot contain :", since it uses ":" internally to namespace its own
// Redis keys). "__" preserves the exact same intent - a deterministic
// composite key from scanId + promptId, so accidentally re-queueing the
// same prompt is a no-op rather than a duplicate job (NFR4) - just with
// a separator BullMQ actually allows. See
// explanations/concepts/15-bullmq-queue-basics.md for the full story.
export function buildPromptJobId(scanId: string, promptId: string): string {
  return `${scanId}__${promptId}`;
}
