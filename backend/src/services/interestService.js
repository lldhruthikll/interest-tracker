const { toPaise, fromPaise } = require('../lib/money');
const { todayIST, toDateOnly, toDbDate, periodOf, addMonths, clampDay } = require('../lib/dates');
const { planFifo } = require('./allocation');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Due dates ('YYYY-MM-DD') for a loan from the month after start up to targetDateStr (inclusive).
 * Start 2026-03-15 → 2026-04-15, 2026-05-15, ...; days past month end clamp (Jan 31 → Feb 28).
 */
function getDueDatesForLoan(startDateStr, targetDateStr = todayIST()) {
  const day = Number(startDateStr.slice(8, 10));
  const dueDates = [];
  for (let period = addMonths(periodOf(startDateStr), 1); ; period = addMonths(period, 1)) {
    const due = clampDay(period, day);
    if (due > targetDateStr) break;
    dueDates.push(due);
  }
  return dueDates;
}

/**
 * Synchronises interest records for a specific loan up to today (IST). db: forOwner(...) client or its tx.
 */
async function syncLoanInterestRecords(db, loanId) {
  const loan = await db.loan.findUnique({
    where: { id: Number(loanId) },
    include: { interestRecords: true },
  });

  if (!loan || loan.status === 'CLOSED') {
    return;
  }

  const existing = new Set(loan.interestRecords.map((r) => toDateOnly(r.dueDate)));

  for (const due of getDueDatesForLoan(toDateOnly(loan.startDate), todayIST())) {
    if (existing.has(due)) continue;
    await db.interestRecord.create({
      data: {
        loanId: loan.id,
        dueDate: toDbDate(due),
        periodName: `${MONTH_NAMES[Number(due.slice(5, 7)) - 1]} ${due.slice(0, 4)}`,
        amount: loan.monthlyInterest,
        paidAmount: 0,
        status: 'PENDING',
      },
    });
  }
}

/**
 * Synchronises interest records for all active loans.
 */
async function syncAllActiveLoans(db) {
  const activeLoans = await db.loan.findMany({
    where: { status: 'ACTIVE' },
  });

  for (const loan of activeLoans) {
    await syncLoanInterestRecords(db, loan.id);
  }
}

/**
 * Syncs dues, then allocates amountPaise of an existing payment FIFO (oldest due first).
 * Must run inside a transaction (tx). Returns { allocations, leftoverPaise }.
 */
async function applyPaymentFIFO(tx, { paymentId, borrowerId, loanId, amountPaise }) {
  if (loanId) {
    await syncLoanInterestRecords(tx, loanId);
  } else {
    const loans = await tx.loan.findMany({ where: { borrowerId, status: 'ACTIVE' } });
    for (const l of loans) {
      await syncLoanInterestRecords(tx, l.id);
    }
  }

  const pendingRecords = await tx.interestRecord.findMany({
    where: {
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      loan: { borrowerId, ...(loanId ? { id: loanId } : {}) },
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  });

  const byId = new Map(pendingRecords.map((r) => [r.id, r]));
  const plan = planFifo(
    pendingRecords.map((r) => ({ id: r.id, amountPaise: toPaise(r.amount), paidPaise: toPaise(r.paidAmount) })),
    amountPaise
  );

  const allocations = [];
  for (const { dueId, amountPaise: allocated } of plan.allocations) {
    const record = byId.get(dueId);
    const newPaid = toPaise(record.paidAmount) + allocated;
    await tx.interestRecord.update({
      where: { id: dueId },
      data: {
        paidAmount: fromPaise(newPaid),
        status: newPaid >= toPaise(record.amount) ? 'PAID' : 'PARTIALLY_PAID',
      },
    });
    allocations.push(await tx.paymentAllocation.create({
      data: { paymentId, interestRecordId: dueId, amount: fromPaise(allocated) },
    }));
  }

  return { allocations, leftoverPaise: plan.leftoverPaise };
}

/**
 * Records a payment and allocates it to the oldest pending interest records first (FIFO).
 */
async function allocatePaymentFIFO(db, { borrowerId, loanId, amountPaise, notes, paymentDate = new Date() }) {
  return await db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        borrowerId,
        loanId: loanId || null,
        amount: fromPaise(amountPaise),
        paymentDate: new Date(paymentDate),
        notes: notes || null,
      },
    });

    const { allocations, leftoverPaise } = await applyPaymentFIFO(tx, {
      paymentId: payment.id, borrowerId, loanId, amountPaise,
    });

    return {
      payment,
      allocations,
      remainingPayment: leftoverPaise / 100, // If > 0, customer overpaid or paid ahead of due dates
    };
  });
}

module.exports = {
  getDueDatesForLoan,
  syncLoanInterestRecords,
  syncAllActiveLoans,
  applyPaymentFIFO,
  allocatePaymentFIFO,
};
