-- CreateTable
CREATE TABLE "VideoClip" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "dailyCareLogId" TEXT NOT NULL,
    "dailyCareActionId" TEXT,
    "userId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoClip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoClip_dogId_idx" ON "VideoClip"("dogId");

-- CreateIndex
CREATE INDEX "VideoClip_dailyCareLogId_idx" ON "VideoClip"("dailyCareLogId");

-- CreateIndex
CREATE INDEX "VideoClip_dailyCareActionId_idx" ON "VideoClip"("dailyCareActionId");

-- CreateIndex
CREATE INDEX "VideoClip_userId_idx" ON "VideoClip"("userId");

-- AddForeignKey
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_dailyCareLogId_fkey" FOREIGN KEY ("dailyCareLogId") REFERENCES "DailyCareLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_dailyCareActionId_fkey" FOREIGN KEY ("dailyCareActionId") REFERENCES "DailyCareAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
