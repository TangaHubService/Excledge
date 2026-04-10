/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,planId]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_planId_key" ON "subscriptions"("organizationId", "planId");
