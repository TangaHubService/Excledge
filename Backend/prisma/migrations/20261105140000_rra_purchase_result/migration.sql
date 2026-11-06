-- RRA's answer to /trnsPurchase/savePurchases, kept as proof of what RRA said.
ALTER TABLE "rra_purchases" ADD COLUMN "rraResultCd" TEXT;
ALTER TABLE "rra_purchases" ADD COLUMN "rraResultMsg" TEXT;
ALTER TABLE "rra_purchases" ADD COLUMN "rraResultDt" TEXT;
