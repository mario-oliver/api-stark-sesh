-- Stark Health domain migration: drop coaching OS tables, add dog care models

-- Drop old coaching OS tables (order respects FKs)
DROP TABLE IF EXISTS "ObservationStatAttribution" CASCADE;
DROP TABLE IF EXISTS "DerivedStatLine" CASCADE;
DROP TABLE IF EXISTS "ObservationProcessingJob" CASCADE;
DROP TABLE IF EXISTS "ObservationPlayerTag" CASCADE;
DROP TABLE IF EXISTS "Observation" CASCADE;
DROP TABLE IF EXISTS "PracticeDrillPlayerFocus" CASCADE;
DROP TABLE IF EXISTS "PracticeDrill" CASCADE;
DROP TABLE IF EXISTS "PracticePlan" CASCADE;
DROP TABLE IF EXISTS "SessionPlayerStat" CASCADE;
DROP TABLE IF EXISTS "SessionParticipant" CASCADE;
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "TeamMemberAlias" CASCADE;
DROP TABLE IF EXISTS "TeamMember" CASCADE;
DROP TABLE IF EXISTS "Team" CASCADE;

-- Drop old enums
DROP TYPE IF EXISTS "SessionType" CASCADE;
DROP TYPE IF EXISTS "PlanSource" CASCADE;
DROP TYPE IF EXISTS "ObservationType" CASCADE;
DROP TYPE IF EXISTS "Sentiment" CASCADE;
DROP TYPE IF EXISTS "ObservationScope" CASCADE;
DROP TYPE IF EXISTS "ObservationTaggingStatus" CASCADE;
DROP TYPE IF EXISTS "ObservationStatStatus" CASCADE;
DROP TYPE IF EXISTS "ObservationProcessingJobStatus" CASCADE;
DROP TYPE IF EXISTS "SessionStatMetric" CASCADE;
DROP TYPE IF EXISTS "DerivedStatLineStatus" CASCADE;

-- Create Stark Health enums
CREATE TYPE "CareActionCategory" AS ENUM ('STRETCH', 'STRENGTH', 'MOBILITY', 'WALK', 'MEDICATION', 'GENERAL_CARE', 'OBSERVATION_CHECKPOINT');
CREATE TYPE "CareActionFrequency" AS ENUM ('DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED');
CREATE TYPE "CareActionTimeOfDay" AS ENUM ('MORNING', 'EVENING', 'ANYTIME');
CREATE TYPE "DailyCareActionStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'PARTIALLY_COMPLETED', 'UNCLEAR');
CREATE TYPE "Tolerance" AS ENUM ('GOOD', 'OKAY', 'POOR', 'PAINFUL', 'UNKNOWN');
CREATE TYPE "VoiceNoteProcessingStatus" AS ENUM ('PENDING', 'TRANSCRIBED', 'PROCESSED', 'FAILED');
CREATE TYPE "VoiceNoteJobStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRY', 'COMPLETED', 'FAILED');
CREATE TYPE "HealthObservationType" AS ENUM ('SLIPPING', 'LIMPING', 'WEAKNESS', 'STIFFNESS', 'PAIN', 'LOW_ENERGY', 'APPETITE', 'BATHROOM', 'MEDICATION', 'GENERAL_NOTE');
CREATE TYPE "ObservationSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'UNKNOWN');

-- Dog
CREATE TABLE "Dog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "breed" TEXT,
    "age" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Dog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Dog_name_idx" ON "Dog"("name");

-- DogMember
CREATE TABLE "DogMember" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DogMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DogMember_dogId_userId_key" ON "DogMember"("dogId", "userId");
CREATE INDEX "DogMember_dogId_idx" ON "DogMember"("dogId");
CREATE INDEX "DogMember_userId_idx" ON "DogMember"("userId");
ALTER TABLE "DogMember" ADD CONSTRAINT "DogMember_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DogMember" ADD CONSTRAINT "DogMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CarePlan
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CarePlan_dogId_idx" ON "CarePlan"("dogId");
CREATE INDEX "CarePlan_dogId_isActive_idx" ON "CarePlan"("dogId", "isActive");
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CareAction
CREATE TABLE "CareAction" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "CareActionCategory" NOT NULL,
    "frequency" "CareActionFrequency" NOT NULL DEFAULT 'DAILY',
    "timeOfDay" "CareActionTimeOfDay",
    "targetReps" INTEGER,
    "targetDurationSeconds" INTEGER,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CareAction_carePlanId_idx" ON "CareAction"("carePlanId");
CREATE INDEX "CareAction_carePlanId_isActive_sortOrder_idx" ON "CareAction"("carePlanId", "isActive", "sortOrder");
ALTER TABLE "CareAction" ADD CONSTRAINT "CareAction_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DailyCareLog
CREATE TABLE "DailyCareLog" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyCareLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyCareLog_dogId_date_key" ON "DailyCareLog"("dogId", "date");
CREATE INDEX "DailyCareLog_dogId_idx" ON "DailyCareLog"("dogId");
CREATE INDEX "DailyCareLog_date_idx" ON "DailyCareLog"("date");
ALTER TABLE "DailyCareLog" ADD CONSTRAINT "DailyCareLog_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DailyCareAction
CREATE TABLE "DailyCareAction" (
    "id" TEXT NOT NULL,
    "dailyCareLogId" TEXT NOT NULL,
    "careActionId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "categorySnapshot" "CareActionCategory" NOT NULL,
    "status" "DailyCareActionStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "notes" TEXT,
    "tolerance" "Tolerance",
    "issueObserved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyCareAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyCareAction_dailyCareLogId_careActionId_key" ON "DailyCareAction"("dailyCareLogId", "careActionId");
CREATE INDEX "DailyCareAction_dailyCareLogId_idx" ON "DailyCareAction"("dailyCareLogId");
CREATE INDEX "DailyCareAction_careActionId_idx" ON "DailyCareAction"("careActionId");
CREATE INDEX "DailyCareAction_status_idx" ON "DailyCareAction"("status");
ALTER TABLE "DailyCareAction" ADD CONSTRAINT "DailyCareAction_dailyCareLogId_fkey" FOREIGN KEY ("dailyCareLogId") REFERENCES "DailyCareLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyCareAction" ADD CONSTRAINT "DailyCareAction_careActionId_fkey" FOREIGN KEY ("careActionId") REFERENCES "CareAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyCareAction" ADD CONSTRAINT "DailyCareAction_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- VoiceNote
CREATE TABLE "VoiceNote" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "dailyCareLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audioUrl" TEXT,
    "transcript" TEXT NOT NULL DEFAULT '',
    "processingStatus" "VoiceNoteProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "extraction" JSONB,
    "caregiverNote" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoiceNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceNote_dogId_idx" ON "VoiceNote"("dogId");
CREATE INDEX "VoiceNote_dailyCareLogId_idx" ON "VoiceNote"("dailyCareLogId");
CREATE INDEX "VoiceNote_userId_idx" ON "VoiceNote"("userId");
CREATE INDEX "VoiceNote_processingStatus_idx" ON "VoiceNote"("processingStatus");
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_dailyCareLogId_fkey" FOREIGN KEY ("dailyCareLogId") REFERENCES "DailyCareLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- VoiceNoteProcessingJob
CREATE TABLE "VoiceNoteProcessingJob" (
    "id" TEXT NOT NULL,
    "voiceNoteId" TEXT NOT NULL,
    "status" "VoiceNoteJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoiceNoteProcessingJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceNoteProcessingJob_status_nextRunAt_idx" ON "VoiceNoteProcessingJob"("status", "nextRunAt");
CREATE INDEX "VoiceNoteProcessingJob_voiceNoteId_idx" ON "VoiceNoteProcessingJob"("voiceNoteId");
ALTER TABLE "VoiceNoteProcessingJob" ADD CONSTRAINT "VoiceNoteProcessingJob_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HealthObservation
CREATE TABLE "HealthObservation" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "dailyCareLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voiceNoteId" TEXT,
    "type" "HealthObservationType" NOT NULL,
    "severity" "ObservationSeverity",
    "bodyArea" TEXT,
    "note" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HealthObservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HealthObservation_dogId_idx" ON "HealthObservation"("dogId");
CREATE INDEX "HealthObservation_dailyCareLogId_idx" ON "HealthObservation"("dailyCareLogId");
CREATE INDEX "HealthObservation_userId_idx" ON "HealthObservation"("userId");
CREATE INDEX "HealthObservation_voiceNoteId_idx" ON "HealthObservation"("voiceNoteId");
ALTER TABLE "HealthObservation" ADD CONSTRAINT "HealthObservation_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthObservation" ADD CONSTRAINT "HealthObservation_dailyCareLogId_fkey" FOREIGN KEY ("dailyCareLogId") REFERENCES "DailyCareLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthObservation" ADD CONSTRAINT "HealthObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthObservation" ADD CONSTRAINT "HealthObservation_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
