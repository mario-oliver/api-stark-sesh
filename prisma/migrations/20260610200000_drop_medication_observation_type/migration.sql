-- Drop MEDICATION from HealthObservationType (issue 0005 / ADR-0002).
-- Medication is a CareAction(bucket: RECOVERY), not an observation type.

-- Reclassify any existing medication observations so the enum recreation's cast
-- cannot fail. GENERAL_NOTE keeps the same RECOVERY bucket; the free-text note is
-- preserved. (Dev data is otherwise reseeded by issue 0006.)
UPDATE "HealthObservation" SET "type" = 'GENERAL_NOTE' WHERE "type" = 'MEDICATION';

-- AlterEnum: Postgres cannot DROP a value, so recreate the type without MEDICATION.
BEGIN;
CREATE TYPE "HealthObservationType_new" AS ENUM ('SLIPPING', 'LIMPING', 'WEAKNESS', 'STIFFNESS', 'PAIN', 'LOW_ENERGY', 'APPETITE', 'BATHROOM', 'GENERAL_NOTE');
ALTER TABLE "HealthObservation" ALTER COLUMN "type" TYPE "HealthObservationType_new" USING ("type"::text::"HealthObservationType_new");
ALTER TYPE "HealthObservationType" RENAME TO "HealthObservationType_old";
ALTER TYPE "HealthObservationType_new" RENAME TO "HealthObservationType";
DROP TYPE "HealthObservationType_old";
COMMIT;
