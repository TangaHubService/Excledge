-- AlterTable
ALTER TABLE "users" ADD COLUMN "refreshToken" TEXT,
ADD COLUMN "refreshTokenExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_refreshToken_idx" ON "users"("refreshToken");
