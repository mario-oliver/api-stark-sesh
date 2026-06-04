-- CreateEnum
CREATE TYPE "DogSex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Dog" ADD COLUMN "sex" "DogSex",
ADD COLUMN "weightLbs" DOUBLE PRECISION,
ADD COLUMN "condition" TEXT,
ADD COLUMN "vetName" TEXT,
ADD COLUMN "vetPhone" TEXT;
