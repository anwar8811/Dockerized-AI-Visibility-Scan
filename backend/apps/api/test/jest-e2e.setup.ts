// Runs before this suite's test files (and therefore before @app/common's
// typeorm.config.ts/bullmq.config.ts read process.env at module-load time).
// This e2e test runs on the host (plain `npm run test:e2e`, not inside
// Docker), so it must use the host-published ports from docker-compose.yml
// (localhost:5433/6379) - never the Docker-mode service names ("postgres"/
// "redis") that backend/.env holds since STORY-023, which only resolve
// from *inside* the Compose network.
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5433';
process.env.POSTGRES_DB = 'visibility';
process.env.POSTGRES_USER = 'visibility';
process.env.POSTGRES_PASSWORD = 'visibility';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
