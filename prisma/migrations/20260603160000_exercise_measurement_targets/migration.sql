-- Add timer/rep targets on movements and daily snapshots

ALTER TABLE "CareActionStep" ADD COLUMN "targetReps" INTEGER;
ALTER TABLE "CareActionStep" ADD COLUMN "targetDurationSeconds" INTEGER;

ALTER TABLE "DailyCareAction" ADD COLUMN "targetReps" INTEGER;
ALTER TABLE "DailyCareAction" ADD COLUMN "targetDurationSeconds" INTEGER;

ALTER TABLE "DailyCareActionStep" ADD COLUMN "targetReps" INTEGER;
ALTER TABLE "DailyCareActionStep" ADD COLUMN "targetDurationSeconds" INTEGER;
