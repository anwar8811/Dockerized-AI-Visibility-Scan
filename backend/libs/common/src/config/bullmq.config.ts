import { config as loadDotenv } from 'dotenv';
import type { ConnectionOptions } from 'bullmq';

// Defensive: harmless if dotenv has already loaded (e.g. via
// typeorm.config.ts importing first) - see 08-dotenv-load-order.md.
// Kept here too so this file never silently depends on import order.
loadDotenv();

// Shared by BullModule.forRoot() in both apps/api (producer) and
// apps/worker (consumer, STORY-010) - one Redis connection definition,
// not two that could quietly drift apart.
export const bullMqConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
};

// apps/api-only (STORY-020, brief §24 "Redis Unavailable"). ioredis's
// default maxRetriesPerRequest is 20 - with Redis down, a POST /scans
// enqueue would retry up to 20 times before ever rejecting, so the
// request would sit for tens of seconds instead of failing fast with a
// clear 5xx. A small bounded retry count here makes that queue.add() call
// reject quickly, which the global HttpExceptionFilter (STORY-008) then
// turns into a logged 500 - no new error-handling code needed there.
//
// This must NEVER be applied to apps/worker's connection: BullMQ's Worker
// relies on blocking Redis commands that need unbounded retry/reconnect
// behavior, so bullMqConnection (used by the Worker) keeps ioredis's
// default instead.
export const apiBullMqConnection: ConnectionOptions = {
  ...bullMqConnection,
  maxRetriesPerRequest: 1,
};
