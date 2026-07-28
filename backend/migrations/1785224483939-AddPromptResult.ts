import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPromptResult1785224483939 implements MigrationInterface {
    name = 'AddPromptResult1785224483939'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "prompt_result" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "promptId" uuid NOT NULL, "aiResponse" text NOT NULL, "brandMentioned" boolean NOT NULL, "brandMentionCount" integer NOT NULL, "competitorsMentioned" text array NOT NULL DEFAULT '{}', "citationDomains" text array NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_b5e16a55f39896f3d445c33d86" UNIQUE ("promptId"), CONSTRAINT "PK_158a1cbf33c71ad766aa5526376" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "prompt_result" ADD CONSTRAINT "FK_b5e16a55f39896f3d445c33d866" FOREIGN KEY ("promptId") REFERENCES "prompt"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "prompt_result" DROP CONSTRAINT "FK_b5e16a55f39896f3d445c33d866"`);
        await queryRunner.query(`DROP TABLE "prompt_result"`);
    }

}
