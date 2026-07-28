import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPrompt1785224096799 implements MigrationInterface {
    name = 'AddPrompt1785224096799'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "prompt" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scanId" uuid NOT NULL, "text" text NOT NULL, "status" "public"."scan_prompt_status" NOT NULL DEFAULT 'QUEUED', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d8e3aa07a95560a445ad50fb931" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_08447a0d676a86f72f86d41cfe" ON "prompt" ("scanId") `);
        await queryRunner.query(`ALTER TABLE "prompt" ADD CONSTRAINT "FK_08447a0d676a86f72f86d41cfed" FOREIGN KEY ("scanId") REFERENCES "scan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "prompt" DROP CONSTRAINT "FK_08447a0d676a86f72f86d41cfed"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_08447a0d676a86f72f86d41cfe"`);
        await queryRunner.query(`DROP TABLE "prompt"`);
    }

}
