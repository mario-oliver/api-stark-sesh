-- CreateTable
CREATE TABLE "SessionPlayerStat" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "rebounds" INTEGER NOT NULL DEFAULT 0,
    "steals" INTEGER NOT NULL DEFAULT 0,
    "blocks" INTEGER NOT NULL DEFAULT 0,
    "turnovers" INTEGER NOT NULL DEFAULT 0,
    "fouls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionPlayerStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionPlayerStat_sessionId_teamMemberId_key" ON "SessionPlayerStat"("sessionId", "teamMemberId");

-- CreateIndex
CREATE INDEX "SessionPlayerStat_sessionId_idx" ON "SessionPlayerStat"("sessionId");

-- CreateIndex
CREATE INDEX "SessionPlayerStat_teamMemberId_idx" ON "SessionPlayerStat"("teamMemberId");

-- AddForeignKey
ALTER TABLE "SessionPlayerStat" ADD CONSTRAINT "SessionPlayerStat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPlayerStat" ADD CONSTRAINT "SessionPlayerStat_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
