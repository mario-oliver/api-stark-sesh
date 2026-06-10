-- Reconcile the migrations history with prisma/schema.prisma for issues 0001 + 0002.
-- Those issues edited the schema (flat CareAction with required `bucket`; DailyTask collapsed
-- into DailyCareAction) and shipped code/tests, but never committed migrations — so the live DB
-- drifted two issues behind the generated client. This makes the SQL match the schema. Authored
-- during the issue 0006 inner-loop, which surfaced the drift at the data layer. DESTRUCTIVE:
-- drops the dead CareActionStep / DailyCareActionStep / DailyTask tables and old enums.

-- CreateEnum
CREATE TYPE "DailyCareActionSource" AS ENUM ('PLAN', 'AD_HOC', 'LLM_EXTRACTED', 'PLAN_VARIATION');

-- DropForeignKey
ALTER TABLE "CareActionStep" DROP CONSTRAINT "CareActionStep_careActionId_fkey";

-- DropForeignKey
ALTER TABLE "DailyCareActionStep" DROP CONSTRAINT "DailyCareActionStep_careActionStepId_fkey";

-- DropForeignKey
ALTER TABLE "DailyCareActionStep" DROP CONSTRAINT "DailyCareActionStep_completedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "DailyCareActionStep" DROP CONSTRAINT "DailyCareActionStep_dailyCareActionId_fkey";

-- DropForeignKey
ALTER TABLE "DailyTask" DROP CONSTRAINT "DailyTask_careActionStepId_fkey";

-- DropForeignKey
ALTER TABLE "DailyTask" DROP CONSTRAINT "DailyTask_completedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "DailyTask" DROP CONSTRAINT "DailyTask_dailyCareLogId_fkey";

-- DropForeignKey
ALTER TABLE "DailyTask" DROP CONSTRAINT "DailyTask_substitutedForTaskId_fkey";

-- AlterTable
ALTER TABLE "CareAction" DROP COLUMN "category",
ALTER COLUMN "bucket" SET NOT NULL;

-- AlterTable
ALTER TABLE "DailyCareAction" DROP COLUMN "categorySnapshot",
DROP COLUMN "issueObserved",
ADD COLUMN     "actualDurationSeconds" INTEGER,
ADD COLUMN     "actualReps" INTEGER,
ADD COLUMN     "bucket" "CareBucket" NOT NULL,
ADD COLUMN     "descriptionSnapshot" TEXT,
ADD COLUMN     "extractionConfidence" DOUBLE PRECISION,
ADD COLUMN     "instructionsSnapshot" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" "DailyCareActionSource" NOT NULL DEFAULT 'PLAN',
ADD COLUMN     "substitutedForTaskId" TEXT,
ALTER COLUMN "careActionId" DROP NOT NULL;

-- DropTable
DROP TABLE "CareActionStep";

-- DropTable
DROP TABLE "DailyCareActionStep";

-- DropTable
DROP TABLE "DailyTask";

-- DropEnum
DROP TYPE "CareActionCategory";

-- DropEnum
DROP TYPE "DailyTaskSource";

-- DropEnum
DROP TYPE "DailyTaskStatus";

-- CreateIndex
CREATE INDEX "DailyCareAction_dailyCareLogId_bucket_idx" ON "DailyCareAction"("dailyCareLogId", "bucket");

-- CreateIndex
CREATE INDEX "DailyCareAction_source_idx" ON "DailyCareAction"("source");

-- AddForeignKey
ALTER TABLE "DailyCareAction" ADD CONSTRAINT "DailyCareAction_substitutedForTaskId_fkey" FOREIGN KEY ("substitutedForTaskId") REFERENCES "DailyCareAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
