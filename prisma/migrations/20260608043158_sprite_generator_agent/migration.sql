-- CreateEnum
CREATE TYPE "SpriteGenerationStatus" AS ENUM ('PENDING', 'RUNNING', 'AWAITING_INPUT', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SpriteGenStep" AS ENUM ('NORMALIZE_INPUT', 'BUILD_BASE_REFERENCE', 'GENERATE_FRAMES', 'POST_PROCESS', 'VALIDATE', 'UPLOAD', 'FINALIZE');

-- CreateEnum
CREATE TYPE "SpriteGenJobStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRY', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "SpriteSet" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SpriteGenerationStatus" NOT NULL DEFAULT 'COMPLETED',
    "storagePrefix" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "styleVersion" TEXT NOT NULL DEFAULT 'v1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpriteSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpriteGenerationSession" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SpriteGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "sourcePhotoKey" TEXT NOT NULL,
    "breedInput" TEXT NOT NULL,
    "normalizedBreed" TEXT,
    "prompt" TEXT,
    "currentStep" "SpriteGenStep",
    "steps" JSONB NOT NULL DEFAULT '{}',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spriteSetId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpriteGenerationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpriteGenerationJob" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "SpriteGenJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpriteGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpriteSet_dogId_isActive_idx" ON "SpriteSet"("dogId", "isActive");

-- CreateIndex
CREATE INDEX "SpriteSet_dogId_idx" ON "SpriteSet"("dogId");

-- CreateIndex
CREATE INDEX "SpriteGenerationSession_dogId_idx" ON "SpriteGenerationSession"("dogId");

-- CreateIndex
CREATE INDEX "SpriteGenerationSession_dogId_userId_idx" ON "SpriteGenerationSession"("dogId", "userId");

-- CreateIndex
CREATE INDEX "SpriteGenerationSession_status_idx" ON "SpriteGenerationSession"("status");

-- CreateIndex
CREATE INDEX "SpriteGenerationJob_status_nextRunAt_idx" ON "SpriteGenerationJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "SpriteGenerationJob_sessionId_idx" ON "SpriteGenerationJob"("sessionId");

-- AddForeignKey
ALTER TABLE "SpriteSet" ADD CONSTRAINT "SpriteSet_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpriteGenerationSession" ADD CONSTRAINT "SpriteGenerationSession_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpriteGenerationSession" ADD CONSTRAINT "SpriteGenerationSession_spriteSetId_fkey" FOREIGN KEY ("spriteSetId") REFERENCES "SpriteSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpriteGenerationJob" ADD CONSTRAINT "SpriteGenerationJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpriteGenerationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
