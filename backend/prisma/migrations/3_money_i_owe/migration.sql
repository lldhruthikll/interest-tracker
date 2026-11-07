-- CreateTable
CREATE TABLE "Creditor" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Creditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtEntry" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "creditorId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "paymentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Creditor_ownerId_idx" ON "Creditor"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtEntry_paymentId_key" ON "DebtEntry"("paymentId");

-- CreateIndex
CREATE INDEX "DebtEntry_ownerId_idx" ON "DebtEntry"("ownerId");

-- CreateIndex
CREATE INDEX "DebtEntry_creditorId_idx" ON "DebtEntry"("creditorId");

-- AddForeignKey
ALTER TABLE "Creditor" ADD CONSTRAINT "Creditor_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "Creditor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtEntry" ADD CONSTRAINT "DebtEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "RecurringPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

