-- AlterTable
ALTER TABLE "DailyCareAction" ADD COLUMN     "voiceNoteId" TEXT;

-- CreateIndex
CREATE INDEX "DailyCareAction_voiceNoteId_idx" ON "DailyCareAction"("voiceNoteId");

-- AddForeignKey
ALTER TABLE "DailyCareAction" ADD CONSTRAINT "DailyCareAction_voiceNoteId_fkey" FOREIGN KEY ("voiceNoteId") REFERENCES "VoiceNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
