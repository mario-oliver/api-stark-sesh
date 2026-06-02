-- CreateEnum
CREATE TYPE "ObservationStatStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ObservationProcessingJobStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRY', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SessionStatMetric" AS ENUM ('points', 'assists', 'rebounds', 'steals', 'blocks', 'turnovers', 'fouls');

-- AlterTable
ALTER TABLE "Observation"
ADD COLUMN "statStatus" "ObservationStatStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "statError" TEXT,
ADD COLUMN "statProcessedAt" TIMESTAMP(3),
ADD COLUMN "statExtraction" JSONB;

-- AlterTable
ALTER TABLE "SessionPlayerStat"
ADD COLUMN "computedPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pointsLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pointsManualOverride" INTEGER,
ADD COLUMN "computedAssists" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "assistsLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assistsManualOverride" INTEGER,
ADD COLUMN "computedRebounds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reboundsLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reboundsManualOverride" INTEGER,
ADD COLUMN "computedSteals" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stealsLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stealsManualOverride" INTEGER,
ADD COLUMN "computedBlocks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "blocksLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "blocksManualOverride" INTEGER,
ADD COLUMN "computedTurnovers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "turnoversLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "turnoversManualOverride" INTEGER,
ADD COLUMN "computedFouls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "foulsLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "foulsManualOverride" INTEGER;

-- Backfill computed values from existing values.
UPDATE "SessionPlayerStat"
SET
  "computedPoints" = "points",
  "computedAssists" = "assists",
  "computedRebounds" = "rebounds",
  "computedSteals" = "steals",
  "computedBlocks" = "blocks",
  "computedTurnovers" = "turnovers",
  "computedFouls" = "fouls";

-- CreateTable
CREATE TABLE "ObservationStatAttribution" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "sessionPlayerStatId" TEXT NOT NULL,
    "metric" "SessionStatMetric" NOT NULL,
    "delta" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObservationStatAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservationProcessingJob" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "status" "ObservationProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ObservationProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Observation_statStatus_idx" ON "Observation"("statStatus");

-- CreateIndex
CREATE INDEX "ObservationStatAttribution_observationId_idx" ON "ObservationStatAttribution"("observationId");
CREATE INDEX "ObservationStatAttribution_sessionPlayerStatId_idx" ON "ObservationStatAttribution"("sessionPlayerStatId");
CREATE INDEX "ObservationStatAttribution_metric_idx" ON "ObservationStatAttribution"("metric");

-- CreateIndex
CREATE INDEX "ObservationProcessingJob_status_nextRunAt_idx" ON "ObservationProcessingJob"("status", "nextRunAt");
CREATE INDEX "ObservationProcessingJob_observationId_idx" ON "ObservationProcessingJob"("observationId");

-- AddForeignKey
ALTER TABLE "ObservationStatAttribution"
ADD CONSTRAINT "ObservationStatAttribution_observationId_fkey"
FOREIGN KEY ("observationId") REFERENCES "Observation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ObservationStatAttribution"
ADD CONSTRAINT "ObservationStatAttribution_sessionPlayerStatId_fkey"
FOREIGN KEY ("sessionPlayerStatId") REFERENCES "SessionPlayerStat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ObservationProcessingJob"
ADD CONSTRAINT "ObservationProcessingJob_observationId_fkey"
FOREIGN KEY ("observationId") REFERENCES "Observation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
