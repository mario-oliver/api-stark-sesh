-- Baseline schema: regenerate the block below "CreateSchema" with:
--   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
-- Keep this preamble if you need to recover from a failed partial apply (leftover enums/tables).

-- Teardown: remove partial state from a failed earlier run (e.g. enums created before User FK).
-- Safe on empty DB (IF EXISTS). Destructive if these tables already hold data.
DROP TABLE IF EXISTS "ObservationPlayerTag" CASCADE;
DROP TABLE IF EXISTS "Observation" CASCADE;
DROP TABLE IF EXISTS "PracticeSegmentPlayerFocus" CASCADE;
DROP TABLE IF EXISTS "PracticeSegment" CASCADE;
DROP TABLE IF EXISTS "PracticePlan" CASCADE;
DROP TABLE IF EXISTS "PlanItem" CASCADE;
DROP TABLE IF EXISTS "SessionPlan" CASCADE;
DROP TABLE IF EXISTS "SessionParticipant" CASCADE;
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "TeamMember" CASCADE;
DROP TABLE IF EXISTS "Team" CASCADE;
DROP TABLE IF EXISTS "Subscriptions" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

DROP TYPE IF EXISTS "ObservationTaggingStatus" CASCADE;
DROP TYPE IF EXISTS "ObservationScope" CASCADE;
DROP TYPE IF EXISTS "Sentiment" CASCADE;
DROP TYPE IF EXISTS "ObservationType" CASCADE;
DROP TYPE IF EXISTS "PlanSource" CASCADE;
DROP TYPE IF EXISTS "SessionType" CASCADE;
DROP TYPE IF EXISTS "SessionPlanSource" CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('TEAM_PRACTICE', 'SKILL_SESSION', 'GAME', 'TRYOUT', 'OTHER');

-- CreateEnum
CREATE TYPE "PlanSource" AS ENUM ('MANUAL', 'LLM', 'MIXED');

-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('PLAYER_FEEDBACK', 'TEAM_PATTERN', 'EFFORT', 'TACTICAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED');

-- CreateEnum
CREATE TYPE "ObservationScope" AS ENUM ('TEAM_WIDE', 'PLAYER_SPECIFIC', 'MIXED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ObservationTaggingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriptions" (
    "id" TEXT NOT NULL,
    "status" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "userId" TEXT NOT NULL,
    "currentPeriodEnd" INTEGER,
    "currentPeriodStart" INTEGER,
    "cancelAtPeriodEnd" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notesSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,

    CONSTRAINT "SessionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticePlan" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "userPrompt" TEXT,
    "source" "PlanSource" NOT NULL DEFAULT 'MANUAL',
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSegment" (
    "id" TEXT NOT NULL,
    "practicePlanId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "focusTags" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,

    CONSTRAINT "PracticeSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSegmentPlayerFocus" (
    "segmentId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,

    CONSTRAINT "PracticeSegmentPlayerFocus_pkey" PRIMARY KEY ("segmentId","teamMemberId")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "segmentId" TEXT,
    "rawText" TEXT NOT NULL,
    "observationType" "ObservationType" NOT NULL DEFAULT 'GENERAL',
    "sentiment" "Sentiment",
    "extractedTags" JSONB,
    "scope" "ObservationScope" NOT NULL DEFAULT 'UNKNOWN',
    "taggingStatus" "ObservationTaggingStatus" NOT NULL DEFAULT 'PENDING',
    "taggingError" TEXT,
    "taggedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservationPlayerTag" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationPlayerTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_id_idx" ON "User"("id");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriptions_userId_key" ON "Subscriptions"("userId");

-- CreateIndex
CREATE INDEX "Team_userId_idx" ON "Team"("userId");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_teamId_idx" ON "Session"("teamId");

-- CreateIndex
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");

-- CreateIndex
CREATE INDEX "SessionParticipant_sessionId_idx" ON "SessionParticipant"("sessionId");

-- CreateIndex
CREATE INDEX "SessionParticipant_teamMemberId_idx" ON "SessionParticipant"("teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionParticipant_sessionId_teamMemberId_key" ON "SessionParticipant"("sessionId", "teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticePlan_sessionId_key" ON "PracticePlan"("sessionId");

-- CreateIndex
CREATE INDEX "PracticePlan_sessionId_idx" ON "PracticePlan"("sessionId");

-- CreateIndex
CREATE INDEX "PracticeSegment_practicePlanId_idx" ON "PracticeSegment"("practicePlanId");

-- CreateIndex
CREATE INDEX "PracticeSegment_practicePlanId_sortOrder_idx" ON "PracticeSegment"("practicePlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "PracticeSegmentPlayerFocus_teamMemberId_idx" ON "PracticeSegmentPlayerFocus"("teamMemberId");

-- CreateIndex
CREATE INDEX "Observation_sessionId_idx" ON "Observation"("sessionId");

-- CreateIndex
CREATE INDEX "Observation_segmentId_idx" ON "Observation"("segmentId");

-- CreateIndex
CREATE INDEX "Observation_taggingStatus_idx" ON "Observation"("taggingStatus");

-- CreateIndex
CREATE INDEX "ObservationPlayerTag_observationId_idx" ON "ObservationPlayerTag"("observationId");

-- CreateIndex
CREATE INDEX "ObservationPlayerTag_teamMemberId_idx" ON "ObservationPlayerTag"("teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "ObservationPlayerTag_observationId_teamMemberId_key" ON "ObservationPlayerTag"("observationId", "teamMemberId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticePlan" ADD CONSTRAINT "PracticePlan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSegment" ADD CONSTRAINT "PracticeSegment_practicePlanId_fkey" FOREIGN KEY ("practicePlanId") REFERENCES "PracticePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSegmentPlayerFocus" ADD CONSTRAINT "PracticeSegmentPlayerFocus_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "PracticeSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSegmentPlayerFocus" ADD CONSTRAINT "PracticeSegmentPlayerFocus_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "PracticeSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationPlayerTag" ADD CONSTRAINT "ObservationPlayerTag_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationPlayerTag" ADD CONSTRAINT "ObservationPlayerTag_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
