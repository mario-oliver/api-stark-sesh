-- CreateEnum
CREATE TYPE "ExerciseAgentSessionStatus" AS ENUM ('ACTIVE', 'AWAITING_INPUT', 'DRAFT_READY', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "ExerciseAgentSession" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ExerciseAgentSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "draft" JSONB,
    "research" JSONB,
    "questions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseAgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseAgentSession_dogId_idx" ON "ExerciseAgentSession"("dogId");

-- CreateIndex
CREATE INDEX "ExerciseAgentSession_dogId_userId_idx" ON "ExerciseAgentSession"("dogId", "userId");

-- CreateIndex
CREATE INDEX "ExerciseAgentSession_status_idx" ON "ExerciseAgentSession"("status");

-- AddForeignKey
ALTER TABLE "ExerciseAgentSession" ADD CONSTRAINT "ExerciseAgentSession_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
