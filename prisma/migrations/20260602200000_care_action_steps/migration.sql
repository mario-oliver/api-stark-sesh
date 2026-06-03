-- CreateTable
CREATE TABLE "CareActionStep" (
    "id" TEXT NOT NULL,
    "careActionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "mediaKey" TEXT,
    "mediaContentType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareActionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCareActionStep" (
    "id" TEXT NOT NULL,
    "dailyCareActionId" TEXT NOT NULL,
    "careActionStepId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "status" "DailyCareActionStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCareActionStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareActionStep_careActionId_idx" ON "CareActionStep"("careActionId");

-- CreateIndex
CREATE INDEX "CareActionStep_careActionId_isActive_sortOrder_idx" ON "CareActionStep"("careActionId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "DailyCareActionStep_dailyCareActionId_idx" ON "DailyCareActionStep"("dailyCareActionId");

-- CreateIndex
CREATE INDEX "DailyCareActionStep_careActionStepId_idx" ON "DailyCareActionStep"("careActionStepId");

-- CreateIndex
CREATE INDEX "DailyCareActionStep_status_idx" ON "DailyCareActionStep"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCareActionStep_dailyCareActionId_careActionStepId_key" ON "DailyCareActionStep"("dailyCareActionId", "careActionStepId");

-- AddForeignKey
ALTER TABLE "CareActionStep" ADD CONSTRAINT "CareActionStep_careActionId_fkey" FOREIGN KEY ("careActionId") REFERENCES "CareAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCareActionStep" ADD CONSTRAINT "DailyCareActionStep_dailyCareActionId_fkey" FOREIGN KEY ("dailyCareActionId") REFERENCES "DailyCareAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCareActionStep" ADD CONSTRAINT "DailyCareActionStep_careActionStepId_fkey" FOREIGN KEY ("careActionStepId") REFERENCES "CareActionStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCareActionStep" ADD CONSTRAINT "DailyCareActionStep_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
