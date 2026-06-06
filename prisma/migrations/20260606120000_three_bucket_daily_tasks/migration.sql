-- Three-bucket care model: DailyTask, CareBucket, bucket scores

-- CreateEnum
CREATE TYPE "CareBucket" AS ENUM ('ACTIVITY', 'MOBILITY', 'RECOVERY');
CREATE TYPE "DailyTaskSource" AS ENUM ('PLAN', 'AD_HOC', 'LLM_EXTRACTED', 'PLAN_VARIATION');
CREATE TYPE "DailyTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'PARTIALLY_COMPLETED', 'UNCLEAR');

-- AlterTable CareAction
ALTER TABLE "CareAction" ADD COLUMN "bucket" "CareBucket";

-- AlterTable CareActionStep
ALTER TABLE "CareActionStep" ADD COLUMN "bucket" "CareBucket";

-- AlterTable DailyCareLog
ALTER TABLE "DailyCareLog" ADD COLUMN "bucketScores" JSONB;
ALTER TABLE "DailyCareLog" ADD COLUMN "scoreComputedAt" TIMESTAMP(3);
ALTER TABLE "DailyCareLog" ADD COLUMN "scoreInputVersion" TEXT;

-- AlterTable HealthObservation
ALTER TABLE "HealthObservation" ADD COLUMN "bucket" "CareBucket";

-- CreateTable DailyTask
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "dailyCareLogId" TEXT NOT NULL,
    "bucket" "CareBucket" NOT NULL,
    "source" "DailyTaskSource" NOT NULL DEFAULT 'PLAN',
    "nameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT,
    "instructionsSnapshot" TEXT,
    "status" "DailyTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "notes" TEXT,
    "targetReps" INTEGER,
    "actualReps" INTEGER,
    "targetDurationSeconds" INTEGER,
    "actualDurationSeconds" INTEGER,
    "careActionId" TEXT,
    "careActionStepId" TEXT,
    "substitutedForTaskId" TEXT,
    "metadata" JSONB,
    "extractionConfidence" DOUBLE PRECISION,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyTask_dailyCareLogId_idx" ON "DailyTask"("dailyCareLogId");
CREATE INDEX "DailyTask_dailyCareLogId_bucket_idx" ON "DailyTask"("dailyCareLogId", "bucket");
CREATE INDEX "DailyTask_status_idx" ON "DailyTask"("status");
CREATE INDEX "DailyTask_source_idx" ON "DailyTask"("source");
CREATE INDEX "DailyTask_careActionId_idx" ON "DailyTask"("careActionId");
CREATE INDEX "DailyTask_careActionStepId_idx" ON "DailyTask"("careActionStepId");

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_dailyCareLogId_fkey" FOREIGN KEY ("dailyCareLogId") REFERENCES "DailyCareLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_substitutedForTaskId_fkey" FOREIGN KEY ("substitutedForTaskId") REFERENCES "DailyTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill bucket on CareAction from category
UPDATE "CareAction" SET "bucket" = 'ACTIVITY' WHERE "category" IN ('WALK', 'STRETCH', 'STRENGTH');
UPDATE "CareAction" SET "bucket" = 'MOBILITY' WHERE "category" = 'MOBILITY';
UPDATE "CareAction" SET "bucket" = 'RECOVERY' WHERE "category" IN ('MEDICATION', 'GENERAL_CARE');
UPDATE "CareAction" SET "bucket" = 'MOBILITY' WHERE "category" = 'OBSERVATION_CHECKPOINT';
UPDATE "CareAction" SET "bucket" = 'ACTIVITY' WHERE "bucket" IS NULL;

-- Backfill bucket on CareActionStep from parent action
UPDATE "CareActionStep" s
SET "bucket" = a."bucket"
FROM "CareAction" a
WHERE s."careActionId" = a."id" AND s."bucket" IS NULL;

-- Backfill bucket on HealthObservation from type
UPDATE "HealthObservation" SET "bucket" = 'MOBILITY' WHERE "type" IN ('SLIPPING', 'LIMPING', 'WEAKNESS', 'STIFFNESS', 'PAIN');
UPDATE "HealthObservation" SET "bucket" = 'RECOVERY' WHERE "type" IN ('LOW_ENERGY', 'APPETITE', 'BATHROOM', 'MEDICATION', 'GENERAL_NOTE');
UPDATE "HealthObservation" SET "bucket" = 'MOBILITY' WHERE "bucket" IS NULL;

-- Backfill DailyTask from DailyCareActionStep (flatten movements)
INSERT INTO "DailyTask" (
    "id", "dailyCareLogId", "bucket", "source", "nameSnapshot",
    "descriptionSnapshot", "instructionsSnapshot", "status",
    "completedAt", "completedByUserId", "notes",
    "targetReps", "targetDurationSeconds",
    "careActionId", "careActionStepId", "sortOrder",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    da."dailyCareLogId",
    COALESCE(s."bucket", ca."bucket", 'ACTIVITY'),
    'PLAN',
    das."nameSnapshot",
    s."description",
    s."instructions",
    das."status"::text::"DailyTaskStatus",
    das."completedAt",
    das."completedByUserId",
    das."notes",
    das."targetReps",
    das."targetDurationSeconds",
    da."careActionId",
    das."careActionStepId",
    s."sortOrder",
    das."createdAt",
    das."updatedAt"
FROM "DailyCareActionStep" das
JOIN "DailyCareAction" da ON da."id" = das."dailyCareActionId"
JOIN "CareActionStep" s ON s."id" = das."careActionStepId"
JOIN "CareAction" ca ON ca."id" = da."careActionId";

-- Backfill DailyTask from DailyCareAction without steps (standalone exercises)
INSERT INTO "DailyTask" (
    "id", "dailyCareLogId", "bucket", "source", "nameSnapshot",
    "descriptionSnapshot", "instructionsSnapshot", "status",
    "completedAt", "completedByUserId", "notes",
    "targetReps", "targetDurationSeconds",
    "careActionId", "sortOrder",
    "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    da."dailyCareLogId",
    COALESCE(ca."bucket", 'ACTIVITY'),
    'PLAN',
    da."nameSnapshot",
    ca."description",
    ca."instructions",
    da."status"::text::"DailyTaskStatus",
    da."completedAt",
    da."completedByUserId",
    da."notes",
    da."targetReps",
    da."targetDurationSeconds",
    da."careActionId",
    ca."sortOrder",
    da."createdAt",
    da."updatedAt"
FROM "DailyCareAction" da
JOIN "CareAction" ca ON ca."id" = da."careActionId"
WHERE NOT EXISTS (
    SELECT 1 FROM "DailyCareActionStep" das WHERE das."dailyCareActionId" = da."id"
);
