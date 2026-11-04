-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "placeLabel" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "payerLabel" TEXT NOT NULL,
    "color" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "placeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "defaultAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payer" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "unitId" INTEGER NOT NULL,
    "payerId" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "dueDay" INTEGER NOT NULL,
    "timing" TEXT NOT NULL,
    "firstMonthRule" TEXT NOT NULL,
    "lastMonthRule" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateChange" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "agreementId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDue" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "agreementId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringDue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPayment" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "agreementId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "method" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringAllocation" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "dueId" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceEntry" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "agreementId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "paymentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_ownerId_idx" ON "Category"("ownerId");

-- CreateIndex
CREATE INDEX "Place_ownerId_idx" ON "Place"("ownerId");

-- CreateIndex
CREATE INDEX "Unit_ownerId_idx" ON "Unit"("ownerId");

-- CreateIndex
CREATE INDEX "Payer_ownerId_idx" ON "Payer"("ownerId");

-- CreateIndex
CREATE INDEX "Agreement_ownerId_idx" ON "Agreement"("ownerId");

-- CreateIndex
CREATE INDEX "RateChange_ownerId_idx" ON "RateChange"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "RateChange_agreementId_effectiveFrom_key" ON "RateChange"("agreementId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "RecurringDue_ownerId_idx" ON "RecurringDue"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringDue_agreementId_period_key" ON "RecurringDue"("agreementId", "period");

-- CreateIndex
CREATE INDEX "RecurringPayment_ownerId_idx" ON "RecurringPayment"("ownerId");

-- CreateIndex
CREATE INDEX "RecurringAllocation_ownerId_idx" ON "RecurringAllocation"("ownerId");

-- CreateIndex
CREATE INDEX "AdvanceEntry_ownerId_idx" ON "AdvanceEntry"("ownerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payer" ADD CONSTRAINT "Payer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateChange" ADD CONSTRAINT "RateChange_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateChange" ADD CONSTRAINT "RateChange_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDue" ADD CONSTRAINT "RecurringDue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDue" ADD CONSTRAINT "RecurringDue_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringAllocation" ADD CONSTRAINT "RecurringAllocation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringAllocation" ADD CONSTRAINT "RecurringAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "RecurringPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringAllocation" ADD CONSTRAINT "RecurringAllocation_dueId_fkey" FOREIGN KEY ("dueId") REFERENCES "RecurringDue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceEntry" ADD CONSTRAINT "AdvanceEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceEntry" ADD CONSTRAINT "AdvanceEntry_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceEntry" ADD CONSTRAINT "AdvanceEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "RecurringPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active agreement per unit
CREATE UNIQUE INDEX "Agreement_one_active_per_unit" ON "Agreement"("unitId") WHERE status = 'ACTIVE';
