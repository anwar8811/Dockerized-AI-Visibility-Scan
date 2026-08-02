import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPromptResultRanking1785646324320 implements MigrationInterface {
    name = 'AddPromptResultRanking1785646324320'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "prompt_result_ranking" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "promptResultId" uuid NOT NULL, "brandProfileId" uuid NOT NULL, "mentionCount" integer NOT NULL, "rank" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6e52a9cea00fd3d56a27ae0d22f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_874d62697e27561b316d94895d" ON "prompt_result_ranking" ("promptResultId", "brandProfileId") `);
        await queryRunner.query(`ALTER TABLE "prompt_result" ALTER COLUMN "brandMentioned" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "prompt_result" ALTER COLUMN "brandMentionCount" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "prompt_result" ALTER COLUMN "competitorsMentioned" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "prompt_result" ALTER COLUMN "competitorsMentioned" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "prompt_result_ranking" ADD CONSTRAINT "FK_73a1e220f22753bdf70869cd630" FOREIGN KEY ("promptResultId") REFERENCES "prompt_result"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "prompt_result_ranking" ADD CONSTRAINT "FK_23d0106859f436fa3f121a94862" FOREIGN KEY ("brandProfileId") REFERENCES "brand_profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "prompt_result_ranking" DROP CONSTRAINT "FK_23d0106859f436fa3f121a94862"`);
        await queryRunner.query(`ALTER TABLE "prompt_result_ranking" DROP CONSTRAINT "FK_73a1e220f22753bdf70869cd630"`);
        await queryRunner.query(`ALTER TABLE "prompt_result" ALTER COLUMN "competitorsMentioned" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "prompt_result" ALTER COLUMN "competitorsMentioned" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "prompt_result" ALTER COLUMN "brandMentionCount" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "prompt_result" ALTER COLUMN "brandMentioned" SET NOT NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_874d62697e27561b316d94895d"`);
        await queryRunner.query(`DROP TABLE "prompt_result_ranking"`);
    }

}
