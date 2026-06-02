-- CreateTable
CREATE TABLE "TeamMemberAlias" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMemberAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMemberAlias_teamMemberId_normalizedAlias_key" ON "TeamMemberAlias"("teamMemberId", "normalizedAlias");
CREATE INDEX "TeamMemberAlias_teamMemberId_idx" ON "TeamMemberAlias"("teamMemberId");
CREATE INDEX "TeamMemberAlias_normalizedAlias_idx" ON "TeamMemberAlias"("normalizedAlias");

-- AddForeignKey
ALTER TABLE "TeamMemberAlias"
ADD CONSTRAINT "TeamMemberAlias_teamMemberId_fkey"
FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
