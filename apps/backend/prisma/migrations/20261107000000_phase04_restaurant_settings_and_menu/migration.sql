-- AlterTable
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "receiptFooter" TEXT;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "serviceChargePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 5;
ALTER TABLE "branches" ALTER COLUMN "country" SET DEFAULT 'BD';
ALTER TABLE "branches" ALTER COLUMN "taxRegime" SET DEFAULT 'CUSTOM';

-- AlterTable
ALTER TABLE "restaurants" ALTER COLUMN "currency" SET DEFAULT 'BDT';
ALTER TABLE "restaurants" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Dhaka';

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;
