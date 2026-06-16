-- AlterTable
ALTER TABLE "products" ADD COLUMN     "taxCode" "RraTaxCode",
ADD COLUMN     "measurementUnit" "MeasurementUnit" NOT NULL DEFAULT 'PCS';
