-- AlterTable: Add branchId column to organization_invitations
ALTER TABLE "organization_invitations" ADD COLUMN "branchId" INTEGER;

-- CreateIndex
CREATE INDEX "organization_invitations_branch_id_idx" ON "organization_invitations"("branchId");

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_branchId_fkey" 
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
