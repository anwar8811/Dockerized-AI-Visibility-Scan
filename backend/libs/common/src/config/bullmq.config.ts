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
