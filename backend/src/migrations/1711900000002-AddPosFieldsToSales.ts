import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPosFieldsToSales1711900000002 implements MigrationInterface {
  name = "AddPosFieldsToSales1711900000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."pos_sale_status_enum" AS ENUM('COMPLETED', 'HELD')`);
    await queryRunner.query(`CREATE TYPE "public"."payment_method_enum" AS ENUM('CASH', 'MOBILE_MONEY')`);
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "invoiceNumber" character varying`);
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "posStatus" "public"."pos_sale_status_enum" NOT NULL DEFAULT 'COMPLETED'`);
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "paymentMethod" "public"."payment_method_enum"`);
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "cashierId" character varying`);
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "reference" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "reference"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "cashierId"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "paymentMethod"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "posStatus"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "invoiceNumber"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."pos_sale_status_enum"`);
  }
}
