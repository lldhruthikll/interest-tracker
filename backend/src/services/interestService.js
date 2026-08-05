const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Calculates due dates for a loan from start date up to targetDate (defaults to today).
 * For example: Start date = March 15.
 * First due date = April 15 (April interest).
 * Second due date = May 15 (May interest).
 * Third due date = June 15 (June interest).
 */
function getDueDatesForLoan(startDate, targetDate = new Date()) {
  const dueDates = [];
  const start = new Date(startDate);
  const target = new Date(targetDate);

  // Normalise target to end of day to include due dates on target day
  target.setHours(23, 59, 59, 999);

  let year = start.getFullYear();
  let month = start.getMonth() + 1; // Month after start date is the first due date month
  const targetDay = start.getDate();

  while (true) {
    // Calculate last day of the target month to handle months with fewer days (e.g. Feb)
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const actualDay = Math.min(targetDay, lastDayOfMonth);
    const dueDate = new Date(year, month, actualDay, 0, 0, 0, 0);

    if (dueDate > target) {
      break;
    }

    dueDates.push(dueDate);

    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }

  return dueDates;
}

/**
 * Synchronises interest records for a specific loan up to today.
 */
async function syncLoanInterestRecords(loanId, db = prisma) {
  const loan = await db.loan.findUnique({
    where: { id: Number(loanId) },
    include: { interestRecords: true },
  });

  if (!loan || loan.status === 'CLOSED') {
    return;
  }

  const expectedDueDates = getDueDatesForLoan(loan.startDate, new Date());
  const existingRecordsMap = new Map();

  loan.interestRecords.forEach((record) => {
    const key = new Date(record.dueDate).toISOString().split('T')[0];
    existingRecordsMap.set(key, record);
  });

  for (const dueDate of expectedDueDates) {
    const key = dueDate.toISOString().split('T')[0];
    if (!existingRecordsMap.has(key)) {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const periodName = `${monthNames[dueDate.getMonth()]} ${dueDate.getFullYear()}`;

      await db.interestRecord.create({
        data: {
          loanId: loan.id,
          dueDate: dueDate,
          periodName: periodName,
          amount: loan.monthlyInterest,
          paidAmount: 0,
          status: 'PENDING',
        },
      });
    }
  }
}

/**
 * Synchronises interest records for all active loans.
 */
async function syncAllActiveLoans(db = prisma) {
  const activeLoans = await db.loan.findMany({
    where: { status: 'ACTIVE' },
  });

  for (const loan of activeLoans) {
    await syncLoanInterestRecords(loan.id, db);
  }
}

/**
 * Automatically allocates a payment to the oldest pending interest records first (FIFO).
 */
async function allocatePaymentFIFO({ borrowerId, loanId, amount, notes, paymentDate = new Date() }) {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Payment amount must be a positive number');
  }

  return await prisma.$transaction(async (tx) => {
    // Synchronise interest records first to ensure all accrued interest exists
    if (loanId) {
      await syncLoanInterestRecords(loanId, tx);
    } else {
      const loans = await tx.loan.findMany({ where: { borrowerId: Number(borrowerId), status: 'ACTIVE' } });
      for (const l of loans) {
        await syncLoanInterestRecords(l.id, tx);
      }
    }

    // Find all pending or partially paid interest records ordered by dueDate ASC (oldest first)
    const whereCondition = {
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      loan: {
        borrowerId: Number(borrowerId),
        ...(loanId ? { id: Number(loanId) } : {}),
      },
    };

    const pendingRecords = await tx.interestRecord.findMany({
      where: whereCondition,
      orderBy: { dueDate: 'asc' },
      include: { loan: true },
    });

    // Record the main payment entry
    const payment = await tx.payment.create({
      data: {
        borrowerId: Number(borrowerId),
        loanId: loanId ? Number(loanId) : null,
        amount: numAmount,
        paymentDate: new Date(paymentDate),
        notes: notes || null,
      },
    });

    let remainingPayment = numAmount;
    const allocations = [];

    for (const record of pendingRecords) {
      if (remainingPayment <= 0) break;

      const needed = record.amount - record.paidAmount;
      const allocated = Math.min(remainingPayment, needed);
      const newPaidAmount = record.paidAmount + allocated;
      const newStatus = newPaidAmount >= record.amount ? 'PAID' : 'PARTIALLY_PAID';

      await tx.interestRecord.update({
        where: { id: record.id },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
      });

      const allocation = await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          interestRecordId: record.id,
          amount: allocated,
        },
      });

      allocations.push(allocation);
      remainingPayment -= allocated;
    }

    return {
      payment,
      allocations,
      remainingPayment, // If > 0, customer overpaid or paid ahead of due dates
    };
  });
}

module.exports = {
  getDueDatesForLoan,
  syncLoanInterestRecords,
  syncAllActiveLoans,
  allocatePaymentFIFO,
};
