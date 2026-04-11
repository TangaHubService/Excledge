CREATE TABLE "vsdc_sync_snapshots" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "endpointPath" TEXT NOT NULL,
    "submissionStatus" "EbmSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "requestPayload" JSONB,
    "responseData" JSONB,
    "summary" JSONB,
    "errorMessage" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vsdc_sync_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vsdc_sync_snapshots_organizationId_snapshotType_key"
ON "vsdc_sync_snapshots"("organizationId", "snapshotType");

CREATE INDEX "vsdc_sync_snapshots_organizationId_idx"
ON "vsdc_sync_snapshots"("organizationId");

CREATE INDEX "vsdc_sync_snapshots_snapshotType_idx"
ON "vsdc_sync_snapshots"("snapshotType");

ALTER TABLE "vsdc_sync_snapshots"
ADD CONSTRAINT "vsdc_sync_snapshots_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
