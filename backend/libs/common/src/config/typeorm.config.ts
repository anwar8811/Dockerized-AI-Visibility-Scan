import { config as loadDotenv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';
import { Scan } from '../entities/scan.entity';
import { Prompt } from '../entities/prompt.entity';
import { PromptResult } from '../entities/prompt-result.entity';
import { BrandProfile } from '../entities/brand-profile.entity';

// The real .env file lives at backend/.env (a symlink at the project
// root, `.env -> backend/.env`, lets `docker compose up` find the same
// file automatically too - see explanations/concepts/dotenv-load-order.md).
// All npm scripts (and the TypeORM CLI, invoked via those scripts) run
// with cwd = backend/, so dotenv's default lookup finds it with no extra
// path needed. This call must still run before typeOrmDataSourceOptions
// below reads process.env - it does, since it's placed before that
// object literal.
loadDotenv();

// Used by TypeOrmModule.forRoot() in both apps/api and apps/worker, at
// normal runtime - deliberately has NO `migrations` field. TypeOrmModule
// eagerly requires every file matched by `migrations` as soon as the
// DataSource initializes, even if nothing ever calls runMigrations().
// Since the migration files are plain .ts (only ever executed through
// the TypeORM CLI's ts-node runner, never bundled into the app itself),
// letting the running app touch that glob breaks at boot. Running
// migrations is always a separate, explicit step (`npm run migration:run`),
// never something the app does for itself.
export const typeOrmDataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [Scan, Prompt, PromptResult, BrandProfile],
  synchronize: false,
};

// Used only by the TypeORM CLI (migration:generate / migration:run), run
// from `backend/` via the npm scripts in package.json - this is the one
// place `migrations` is needed, so it's added only here.
export const AppDataSource = new DataSource({
  ...typeOrmDataSourceOptions,
  migrations: [path.join(process.cwd(), 'migrations', '*.{ts,js}')],
});
