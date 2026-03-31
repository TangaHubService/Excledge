import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordResetFields1711900000001 implements MigrationInterface {
  name = "AddPasswordResetFields1711900000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resetPasswordToken" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resetPasswordExpiresAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "resetPasswordExpiresAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "resetPasswordToken"`);
  }
}
