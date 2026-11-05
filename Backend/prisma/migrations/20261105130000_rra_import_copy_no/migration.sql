-- Lines RRA re-sends as waiting after being actioned get a new pending copy; copy 0 is the first delivery.
DROP INDEX "rra_import_items_organizationId_taskCd_dclDe_itemSeq_key";

ALTER TABLE "rra_import_items" ADD COLUMN "copyNo" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "rra_import_items_organizationId_taskCd_dclDe_itemSeq_copyNo_key" ON "rra_import_items"("organizationId", "taskCd", "dclDe", "itemSeq", "copyNo");
