-- Store S3 object keys instead of inline/base64 URLs
ALTER TABLE "Dog" RENAME COLUMN "photoUrl" TO "photoKey";

UPDATE "Dog"
SET "photoKey" = NULL
WHERE "photoKey" IS NOT NULL
  AND (
    "photoKey" LIKE 'data:%'
    OR "photoKey" LIKE 'http://%'
    OR "photoKey" LIKE 'https://%'
  );
