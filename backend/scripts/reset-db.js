/**
 * DB Reset Script
 * Truncates all data except the User table (keeps admin login).
 * Run with: node scripts/reset-db.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('Starting DB reset...');

  // Delete in order respecting foreign key constraints
  const deleted = {};

  deleted.paymentAllocations = await prisma.paymentAllocation.deleteMany({});
  console.log(`✓ Deleted ${deleted.paymentAllocations.count} PaymentAllocation rows`);

  deleted.payments = await prisma.payment.deleteMany({});
  console.log(`✓ Deleted ${deleted.payments.count} Payment rows`);

  deleted.interestRecords = await prisma.interestRecord.deleteMany({});
  console.log(`✓ Deleted ${deleted.interestRecords.count} InterestRecord rows`);

  deleted.loans = await prisma.loan.deleteMany({});
  console.log(`✓ Deleted ${deleted.loans.count} Loan rows`);

  deleted.borrowers = await prisma.borrower.deleteMany({});
  console.log(`✓ Deleted ${deleted.borrowers.count} Borrower rows`);

  console.log('\n✅ Database reset complete. Admin user account preserved.');
  await prisma.$disconnect();
}

resetDatabase().catch((e) => {
  console.error('Reset failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
