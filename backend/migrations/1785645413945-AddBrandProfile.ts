import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBrandProfile1785645413945 implements MigrationInterface {
    name = 'AddBrandProfile1785645413945'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."brand_profile_role" AS ENUM('BRAND', 'COMPETITOR')`);
        await queryRunner.query(`CREATE TYPE "public"."brand_profile_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "brand_profile" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scanId" uuid NOT NULL, "role" "public"."brand_profile_role" NOT NULL, "name" character varying NOT NULL, "sourceUrl" character varying, "servicesOffered" text, "metaDescription" text, "summary" text, "pros" text array NOT NULL DEFAULT '{}', "cons" text array NOT NULL DEFAULT '{}', "status" "public"."brand_profile_status" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b293356a3488bdac7b90ed5e75c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d4ff5e6e7813cc0d8cc07c8e0d" ON "brand_profile" ("scanId") `);
        await queryRunner.query(`CREATE INDEX "IDX_a9e459b0d1eddb8fe21f74f17e" ON "brand_profile" ("scanId", "status") `);
        await queryRunner.query(`ALTER TABLE "brand_profile" ADD CONSTRAINT "FK_d4ff5e6e7813cc0d8cc07c8e0df" FOREIGN KEY ("scanId") REFERENCES "scan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "brand_profile" DROP CONSTRAINT "FK_d4ff5e6e7813cc0d8cc07c8e0df"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a9e459b0d1eddb8fe21f74f17e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d4ff5e6e7813cc0d8cc07c8e0d"`);
        await queryRunner.query(`DROP TABLE "brand_profile"`);
        await queryRunner.query(`DROP TYPE "public"."brand_profile_status"`);
        await queryRunner.query(`DROP TYPE "public"."brand_profile_role"`);
    }

}
