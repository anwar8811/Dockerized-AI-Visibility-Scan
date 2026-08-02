export enum ScanPromptStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  // EPIC-13 (KAD-29) - the 3 earlier stages of POST /scans/auto's new
  // 3-stage flow, before it falls back to PROCESSING/COMPLETED above for
  // its final analysis stage. Additive only - the classic POST /scans
  // pipeline never uses or transitions through these.
  GATHERING_INTELLIGENCE = 'GATHERING_INTELLIGENCE',
  INTELLIGENCE_READY = 'INTELLIGENCE_READY',
  PROMPTS_GENERATED = 'PROMPTS_GENERATED',
}
