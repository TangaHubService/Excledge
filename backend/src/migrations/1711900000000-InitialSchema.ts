import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1711900000000 implements MigrationInterface {
  name = "InitialSchema1711900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."sale_status_enum" AS ENUM('PENDING_CERTIFICATION', 'CERTIFIED', 'FAILED', 'CANCELLED')`);
    await queryRunner.query(`CREATE TYPE "public"."stock_movement_type_enum" AS ENUM('PURCHASE_IN', 'SALE_OUT', 'ADJUSTMENT')`);
    await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "permissions" text NOT NULL DEFAULT '', CONSTRAINT "UQ_role_name" UNIQUE ("name"), CONSTRAINT "PK_roles_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "branches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying, "currency" character varying NOT NULL DEFAULT 'RWF', CONSTRAINT "PK_branches_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "email" character varying NOT NULL, "fullName" character varying NOT NULL, "passwordHash" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "roleId" uuid NOT NULL, "branchId" uuid, CONSTRAINT "UQ_users_email" UNIQUE ("email"), CONSTRAINT "PK_users_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "deletedAt" TIMESTAMP, CONSTRAINT "UQ_categories_name" UNIQUE ("name"), CONSTRAINT "PK_categories_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "sku" character varying NOT NULL, "categoryId" uuid NOT NULL, "taxCategory" character varying NOT NULL DEFAULT 'VAT_18', "unitPrice" numeric(18,2) NOT NULL DEFAULT '0', "reorderLevel" numeric(18,3) NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, "deletedAt" TIMESTAMP, CONSTRAINT "UQ_products_sku" UNIQUE ("sku"), CONSTRAINT "PK_products_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "suppliers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "tin" character varying, "phone" character varying, "deletedAt" TIMESTAMP, CONSTRAINT "PK_suppliers_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying NOT NULL, "tin" character varying, "phone" character varying, "deletedAt" TIMESTAMP, CONSTRAINT "PK_customers_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "purchases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "branchId" uuid NOT NULL, "supplierId" uuid NOT NULL, "referenceNo" character varying NOT NULL, "totalAmount" numeric(18,2) NOT NULL DEFAULT '0', CONSTRAINT "PK_purchases_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "purchase_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "purchaseId" uuid NOT NULL, "productId" uuid NOT NULL, "quantity" numeric(18,3) NOT NULL, "unitCost" numeric(18,2) NOT NULL, CONSTRAINT "PK_purchase_items_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "sales" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "branchId" uuid NOT NULL, "customerId" uuid, "invoiceNo" character varying NOT NULL, "certificationStatus" "public"."sale_status_enum" NOT NULL DEFAULT 'PENDING_CERTIFICATION', "complianceReference" character varying, "externalReceiptId" character varying, "cancelledSaleId" character varying, "totalAmount" numeric(18,2) NOT NULL DEFAULT '0', CONSTRAINT "PK_sales_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "sale_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "saleId" uuid NOT NULL, "productId" uuid NOT NULL, "quantity" numeric(18,3) NOT NULL, "unitPrice" numeric(18,2) NOT NULL, CONSTRAINT "PK_sale_items_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "inventory_balances" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "branchId" uuid NOT NULL, "productId" uuid NOT NULL, "quantity" numeric(18,3) NOT NULL DEFAULT '0', CONSTRAINT "UQ_inventory_balances_branch_product" UNIQUE ("branchId", "productId"), CONSTRAINT "PK_inventory_balances_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "stock_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "branchId" uuid NOT NULL, "productId" uuid NOT NULL, "type" "public"."stock_movement_type_enum" NOT NULL, "quantityDelta" numeric(18,3) NOT NULL, "referenceType" character varying NOT NULL, "referenceId" uuid NOT NULL, "reason" character varying, CONSTRAINT "PK_stock_movements_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "stock_adjustments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "branchId" uuid NOT NULL, "productId" uuid NOT NULL, "quantityDelta" numeric(18,3) NOT NULL, "reason" character varying NOT NULL, "performedBy" uuid, CONSTRAINT "PK_stock_adjustments_id" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "action" character varying NOT NULL, "entityType" character varying NOT NULL, "entityId" uuid NOT NULL, "actorId" uuid, "before" jsonb, "after" jsonb, CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"))`);

    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_roleId" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_branchId" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_products_categoryId" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "stock_adjustments"`);
    await queryRunner.query(`DROP TABLE "stock_movements"`);
    await queryRunner.query(`DROP TABLE "inventory_balances"`);
    await queryRunner.query(`DROP TABLE "sale_items"`);
    await queryRunner.query(`DROP TABLE "sales"`);
    await queryRunner.query(`DROP TABLE "purchase_items"`);
    await queryRunner.query(`DROP TABLE "purchases"`);
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TABLE "suppliers"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "branches"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TYPE "public"."stock_movement_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."sale_status_enum"`);
  }
}
