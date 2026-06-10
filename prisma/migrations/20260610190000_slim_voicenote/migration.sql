-- Slim VoiceNote to a dumb artifact (ADR-0002 move 5 / issue 0004).
-- DESTRUCTIVE: drops the one-shot extraction fields. VoiceNote now holds only
-- audio + Whisper transcript + transcription status + FKs; extraction is
-- conversational and lives in CareAgentSession. processingStatus means
-- transcription state only.

-- DropColumn
ALTER TABLE "VoiceNote" DROP COLUMN "extraction";

-- DropColumn
ALTER TABLE "VoiceNote" DROP COLUMN "caregiverNote";

-- DropColumn
ALTER TABLE "VoiceNote" DROP COLUMN "needsReview";
