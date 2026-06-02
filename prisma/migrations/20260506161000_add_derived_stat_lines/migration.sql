-- CreateEnum
CREATE TYPE "DerivedStatLineStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EDITED');

-- CreateTable
CREATE TABLE "DerivedStatLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "teamMemberId" TEXT,
    "playerRef" TEXT,
    "evidenceText" TEXT,
    "lineStart" INTEGER,
    "lineEnd" INTEGER,
    "confidence" DOUBLE PRECISION,
    "points" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "rebounds" INTEGER NOT NULL DEFAULT 0,
    "steals" INTEGER NOT NULL DEFAULT 0,
    "blocks" INTEGER NOT NULL DEFAULT 0,
    "turnovers" INTEGER NOT NULL DEFAULT 0,
    "fouls" INTEGER NOT NULL DEFAULT 0,
    "status" "DerivedStatLineStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "runId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DerivedStatLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DerivedStatLine_sessionId_status_idx" ON "DerivedStatLine"("sessionId", "status");
CREATE INDEX "DerivedStatLine_observationId_idx" ON "DerivedStatLine"("observationId");
CREATE INDEX "DerivedStatLine_teamMemberId_idx" ON "DerivedStatLine"("teamMemberId");
CREATE INDEX "DerivedStatLine_runId_idx" ON "DerivedStatLine"("runId");

-- AddForeignKey
ALTER TABLE "DerivedStatLine"
ADD CONSTRAINT "DerivedStatLine_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DerivedStatLine"
ADD CONSTRAINT "DerivedStatLine_observationId_fkey"
FOREIGN KEY ("observationId") REFERENCES "Observation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DerivedStatLine"
ADD CONSTRAINT "DerivedStatLine_teamMemberId_fkey"
FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DerivedStatLine"
ADD CONSTRAINT "DerivedStatLine_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
