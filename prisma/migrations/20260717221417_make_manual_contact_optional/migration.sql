-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "customerPhone" DROP NOT NULL,
ALTER COLUMN "customerEmail" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;
