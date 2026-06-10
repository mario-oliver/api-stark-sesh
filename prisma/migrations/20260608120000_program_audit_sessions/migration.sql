-- CreateEnum
CREATE TYPE "ProgramAuditSessionStatus" AS ENUM ('ACTIVE', 'AWAITING_INPUT', 'REPORT_READY', 'PLAN_READY', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "ProgramAuditSession" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ProgramAuditSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "report" JSONB,
    "plan" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramAuditSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramAuditSession_dogId_idx" ON "ProgramAuditSession"("dogId");

-- CreateIndex
CREATE INDEX "ProgramAuditSession_dogId_userId_idx" ON "ProgramAuditSession"("dogId", "userId");

-- CreateIndex
CREATE INDEX "ProgramAuditSession_status_idx" ON "ProgramAuditSession"("status");

-- AddForeignKey
ALTER TABLE "ProgramAuditSession" ADD CONSTRAINT "ProgramAuditSession_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "Dog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
