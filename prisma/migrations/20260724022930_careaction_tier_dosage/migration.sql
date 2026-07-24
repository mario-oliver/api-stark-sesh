-- CreateEnum
CREATE TYPE "CareActionTier" AS ENUM ('CORE', 'ROUTINE', 'ON_WALKS', 'AS_NEEDED');

-- AlterTable
ALTER TABLE "CareAction" ADD COLUMN     "daysPerWeek" INTEGER,
ADD COLUMN     "referenceUrl" TEXT,
ADD COLUMN     "restBetweenSetsSeconds" INTEGER,
ADD COLUMN     "targetHoldSeconds" INTEGER,
ADD COLUMN     "targetSets" INTEGER,
ADD COLUMN     "tier" "CareActionTier";
