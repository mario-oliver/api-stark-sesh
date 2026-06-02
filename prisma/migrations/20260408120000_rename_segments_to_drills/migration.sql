-- Rename practice segments to drills; map legacy notes into description.

ALTER TABLE "PracticeSegmentPlayerFocus" DROP CONSTRAINT "PracticeSegmentPlayerFocus_segmentId_fkey";
ALTER TABLE "Observation" DROP CONSTRAINT "Observation_segmentId_fkey";

ALTER TABLE "PracticeSegment" RENAME TO "PracticeDrill";
ALTER TABLE "PracticeDrill" RENAME COLUMN "name" TO "title";
ALTER TABLE "PracticeDrill" ADD COLUMN "description" TEXT;
ALTER TABLE "PracticeDrill" ADD COLUMN "execution" TEXT;
UPDATE "PracticeDrill" SET "description" = "notes" WHERE "notes" IS NOT NULL;
ALTER TABLE "PracticeDrill" DROP COLUMN "notes";

ALTER TABLE "PracticeDrill" DROP CONSTRAINT "PracticeSegment_practicePlanId_fkey";
ALTER TABLE "PracticeDrill" ADD CONSTRAINT "PracticeDrill_practicePlanId_fkey" FOREIGN KEY ("practicePlanId") REFERENCES "PracticePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeSegmentPlayerFocus" DROP CONSTRAINT "PracticeSegmentPlayerFocus_pkey";
ALTER TABLE "PracticeSegmentPlayerFocus" RENAME COLUMN "segmentId" TO "drillId";
ALTER TABLE "PracticeSegmentPlayerFocus" RENAME TO "PracticeDrillPlayerFocus";
ALTER TABLE "PracticeDrillPlayerFocus" ADD CONSTRAINT "PracticeDrillPlayerFocus_pkey" PRIMARY KEY ("drillId", "teamMemberId");

ALTER TABLE "PracticeDrillPlayerFocus" ADD CONSTRAINT "PracticeDrillPlayerFocus_drillId_fkey" FOREIGN KEY ("drillId") REFERENCES "PracticeDrill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Observation" RENAME COLUMN "segmentId" TO "drillId";
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_drillId_fkey" FOREIGN KEY ("drillId") REFERENCES "PracticeDrill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER INDEX "PracticeSegment_practicePlanId_idx" RENAME TO "PracticeDrill_practicePlanId_idx";
ALTER INDEX "PracticeSegment_practicePlanId_sortOrder_idx" RENAME TO "PracticeDrill_practicePlanId_sortOrder_idx";
ALTER INDEX "PracticeSegmentPlayerFocus_teamMemberId_idx" RENAME TO "PracticeDrillPlayerFocus_teamMemberId_idx";
ALTER INDEX "Observation_segmentId_idx" RENAME TO "Observation_drillId_idx";

ALTER TABLE "PracticeDrill" RENAME CONSTRAINT "PracticeSegment_pkey" TO "PracticeDrill_pkey";
