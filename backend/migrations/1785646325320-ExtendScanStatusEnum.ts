import { MigrationInterface, QueryRunner } from "typeorm";

// Split into its own migration, separate from AddPromptResultRanking's
// table/column changes (EPIC-13, STORY-038) - kept isolated so an enum-type
// change is never bundled with unrelated DDL in the same migration file.
//
// TypeORM's own auto-generated version of this migration converts one
// column to the new type, drops the renamed-old type, THEN converts the
// second column - which fails ("column status of table scan depends on
// type scan_prompt_status_old") since the second column (scan.status)
// still depends on the old type at the point of the first DROP TYPE. This
// hand-written version converts BOTH columns first, then drops the old
// type exactly once, at the end.
export class ExtendScanStatusEnum1785646325320 implements MigrationInterface {
    name = 'ExtendScanStatusEnum1785646325320'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."scan_prompt_status" RENAME TO "scan_prompt_status_old"`);
        await queryRunner.query(`CREATE TYPE "public"."scan_prompt_status" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'GATHERING_INTELLIGENCE', 'INTELLIGENCE_READY', 'PROMPTS_GENERATED')`);

        await queryRunner.query(`ALTER TABLE "prompt" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "prompt" ALTER COLUMN "status" TYPE "public"."scan_prompt_status" USING "status"::"text"::"public"."scan_prompt_status"`);
        await queryRunner.query(`ALTER TABLE "prompt" ALTER COLUMN "status" SET DEFAULT 'QUEUED'`);

        await queryRunner.query(`ALTER TABLE "scan" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "scan" ALTER COLUMN "status" TYPE "public"."scan_prompt_status" USING "status"::"text"::"public"."scan_prompt_status"`);
        await queryRunner.query(`ALTER TABLE "scan" ALTER COLUMN "status" SET DEFAULT 'QUEUED'`);

        await queryRunner.query(`DROP TYPE "public"."scan_prompt_status_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."scan_prompt_status_old" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')`);

        await queryRunner.query(`ALTER TABLE "prompt" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "prompt" ALTER COLUMN "status" TYPE "public"."scan_prompt_status_old" USING "status"::"text"::"public"."scan_prompt_status_old"`);
        await queryRunner.query(`ALTER TABLE "prompt" ALTER COLUMN "status" SET DEFAULT 'QUEUED'`);

        await queryRunner.query(`ALTER TABLE "scan" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "scan" ALTER COLUMN "status" TYPE "public"."scan_prompt_status_old" USING "status"::"text"::"public"."scan_prompt_status_old"`);
        await queryRunner.query(`ALTER TABLE "scan" ALTER COLUMN "status" SET DEFAULT 'QUEUED'`);

        await queryRunner.query(`DROP TYPE "public"."scan_prompt_status"`);
        await queryRunner.query(`ALTER TYPE "public"."scan_prompt_status_old" RENAME TO "scan_prompt_status"`);
    }

}
