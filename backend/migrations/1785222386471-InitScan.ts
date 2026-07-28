import { MigrationInterface, QueryRunner } from "typeorm";

export class InitScan1785222386471 implements MigrationInterface {
    name = 'InitScan1785222386471'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."scan_prompt_status" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "scan" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "brandName" character varying NOT NULL, "website" character varying NOT NULL, "competitors" text array NOT NULL, "status" "public"."scan_prompt_status" NOT NULL DEFAULT 'QUEUED', "totalPrompts" integer NOT NULL, "processedPrompts" integer NOT NULL DEFAULT '0', "visibilityScore" integer, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9868a638d0569ba3fe3bddcef84" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "scan"`);
        await queryRunner.query(`DROP TYPE "public"."scan_prompt_status"`);
    }

}
