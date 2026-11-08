-- AlterTable
ALTER TABLE "Borrower" ADD COLUMN     "smsReminders" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Payer" ADD COLUMN     "smsReminders" BOOLEAN NOT NULL DEFAULT true;

