-- Unify agent sessions into CareAgentSession (ADR-0002 move 4 / issue 0003).
-- DESTRUCTIVE: drops the two former per-agent session tables. Their rows are
-- transient conversational scaffolding (never durable truth), so they are not
-- migrated. Reseed (issue 0006) repopulates dev data.

-- DropForeignKey
ALTER TABLE "ExerciseAgentSession" DROP CONSTRAINT "ExerciseAgentSession_dogId_fkey";

-- DropForeignKey
ALTER TABLE "ProgramAuditSession" DROP CONSTRAINT "ProgramAuditSession_dogId_fkey";

-- DropTable
DROP TABLE "ExerciseAgentSession";

-- DropTable
DROP TABLE "ProgramAuditSession";

-- DropEnum
DROP TYPE "ExerciseAgentSessionStatus";

-- DropEnum
DROP TYPE "ProgramAuditSessionStatus";

-- CreateEnum
CREATE TYPE "CareAgentSessionKind" AS ENUM ('DAILY_LOG', 'PLAN_BUILD', 'PLAN_AUDIT');

-- CreateEnum
CREATE TYPE "CareAgentSessionStatus" AS ENUM ('ACTIVE', 'AWAITING_INPUT', 'DRAFT_READY', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "CareAgentSession" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CareAgentSessionKind" NOT NULL,
    "status" "CareAgentSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "questions" JSONB,
    "draft" JSONB,
    "voiceNoteId" TEXT,
    "committedCarePlanId" TEXT,
    "committedCareActionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareAgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareAgentSession_dogId_idx" ON "CareAgentSession"("dogId");

-- CreateIndex
CREATE INDEX "CareAgentSession_dogId_userId_idx" ON "CareAgentSession"("dogId", "userId");

-- CreateIndex
CREATE INDEX "CareAgentSession_dogId_kind_idx" ON "CareAgentSession"("dogId", "kind");

-- CreateIndex
CREATE INDEX "CareAgentSession_status_idx" ON "CareAgentSession"("status");

-- CreateIndex
CREATE INDEX "CareAgentSession_voiceNoteId_idx" ON "CareAgentSession"("voiceNoteId");

-- AddForeignKey
ALTER TABLE "CareAgentSession" ADD CONSTRAINT "CareAgentSession_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareAgentSession" ADD CONSTRAINT "CareAgentSession_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareAgentSession" ADD CONSTRAINT "CareAgentSession_committedCarePlanId_fkey" FOREIGN KEY ("committedCarePlanId") REFERENCES "CarePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareAgentSession" ADD CONSTRAINT "CareAgentSession_committedCareActionId_fkey" FOREIGN KEY ("committedCareActionId") REFERENCES "CareAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
