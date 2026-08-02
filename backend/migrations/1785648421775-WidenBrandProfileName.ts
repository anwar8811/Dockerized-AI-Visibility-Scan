import { MigrationInterface, QueryRunner } from "typeorm";

export class WidenBrandProfileName1785648421775 implements MigrationInterface {
    name = 'WidenBrandProfileName1785648421775'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "brand_profile" ALTER COLUMN "name" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "brand_profile" ALTER COLUMN "name" SET NOT NULL`);
    }

}
