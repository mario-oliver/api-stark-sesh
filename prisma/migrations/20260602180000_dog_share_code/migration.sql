-- Add shareCode column for pet invite workflow
ALTER TABLE "Dog" ADD COLUMN "shareCode" TEXT;

DO $$
DECLARE
  r RECORD;
  code TEXT;
  alphabet TEXT := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  i INT;
  attempts INT;
BEGIN
  FOR r IN SELECT id FROM "Dog" WHERE "shareCode" IS NULL LOOP
    attempts := 0;
    LOOP
      code := '';
      FOR i IN 1..8 LOOP
        code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Dog" WHERE "shareCode" = code);
      attempts := attempts + 1;
      IF attempts > 100 THEN
        RAISE EXCEPTION 'Failed to generate unique share code for dog %', r.id;
      END IF;
    END LOOP;
    UPDATE "Dog" SET "shareCode" = code WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "Dog" ALTER COLUMN "shareCode" SET NOT NULL;

CREATE UNIQUE INDEX "Dog_shareCode_key" ON "Dog"("shareCode");
