-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "original_sale_id" TEXT;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_original_sale_id_fkey" FOREIGN KEY ("original_sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
