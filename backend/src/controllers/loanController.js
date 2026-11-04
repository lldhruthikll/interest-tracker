const { syncLoanInterestRecords, getDueDatesForLoan } = require('../services/interestService');
const { toPaise, fromPaise, parseAmountPaise } = require('../lib/money');
const { todayIST, toDateOnly, toDbDate, isValidDateStr } = require('../lib/dates');
const { ValidationError, NotFound, parseId } = require('../lib/errors');
const { requireOwned } = require('../lib/ownerDb');

async function createLoan(req, res) {
  const { borrowerId, principal, monthlyInterest, startDate, notes } = req.body;

  if (!borrowerId || !principal || !monthlyInterest || !startDate) {
    throw new ValidationError('Borrower ID, Principal, Monthly Interest, and Start Date are required');
  }
  if (!isValidDateStr(startDate)) throw new ValidationError('Invalid start date format');

  const borrower = await requireOwned(req.db, 'borrower', parseId(borrowerId));

  const newLoan = await req.db.loan.create({
    data: {
      borrowerId: borrower.id,
      principal: fromPaise(parseAmountPaise(principal)),
      monthlyInterest: fromPaise(parseAmountPaise(monthlyInterest)),
      startDate: toDbDate(startDate),
      dueDay: Number(startDate.slice(8, 10)),
      status: 'ACTIVE',
      notes: notes || null,
    },
  });

  // Synchronise interest records immediately for this new loan
  await syncLoanInterestRecords(req.db, newLoan.id);

  const loanWithRecords = await req.db.loan.findUnique({
    where: { id: newLoan.id },
    include: { interestRecords: true },
  });

  return res.status(201).json(loanWithRecords);
}

async function updateLoan(req, res) {
  const id = parseId(req.params.id);
  const { principal, monthlyInterest, startDate, notes } = req.body;

  if (startDate && !isValidDateStr(startDate)) throw new ValidationError('Invalid start date format');

  // One transaction: a failure can't leave the old and new schedules' dues side by side.
  const updatedLoan = await req.db.$transaction(async (tx) => {
    const existing = await requireOwned(tx, 'loan', id);

    const updated = await tx.loan.update({
      where: { id },
      data: {
        ...(principal !== undefined && { principal: fromPaise(parseAmountPaise(principal)) }),
        ...(monthlyInterest !== undefined && { monthlyInterest: fromPaise(parseAmountPaise(monthlyInterest)) }),
        ...(startDate && { startDate: toDbDate(startDate), dueDay: Number(startDate.slice(8, 10)) }),
        ...(notes !== undefined && { notes }),
      },
    });

    // Start date moved: drop unpaid dues that are no longer on the schedule. Dues with any payment are kept.
    if (startDate && startDate !== toDateOnly(existing.startDate)) {
      await tx.interestRecord.deleteMany({
        where: {
          loanId: id,
          paidAmount: 0,
          dueDate: { notIn: getDueDatesForLoan(startDate, todayIST()).map(toDbDate) },
        },
      });
    }

    if (updated.status === 'ACTIVE') await syncLoanInterestRecords(tx, id);
    return updated;
  });

  return res.json(updatedLoan);
}

async function updateLoanStatus(req, res) {
  const id = parseId(req.params.id);
  const { status } = req.body; // 'ACTIVE' or 'CLOSED'

  if (!['ACTIVE', 'CLOSED'].includes(status)) throw new ValidationError('Status must be ACTIVE or CLOSED');

  const updatedLoan = await req.db.loan.update({ where: { id }, data: { status } }); // not owned -> P2025 -> 404

  if (status === 'ACTIVE') await syncLoanInterestRecords(req.db, id);

  return res.json(updatedLoan);
}

async function deleteLoan(req, res) {
  await req.db.loan.delete({ where: { id: parseId(req.params.id) } }); // not owned -> P2025 -> 404
  return res.json({ message: 'Loan deleted successfully' });
}

async function clearInterestRecord(req, res) {
  const record = await req.db.interestRecord.findUnique({
    where: { id: parseId(req.params.id) },
    include: { loan: true },
  });
  if (!record) throw new NotFound('Interest record not found');

  const pendingPaise = toPaise(record.amount) - toPaise(record.paidAmount);
  if (pendingPaise <= 0) throw new ValidationError('This record is already fully paid');

  // Allocate payment to clear this specific record
  await req.db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        borrowerId: record.loan.borrowerId,
        loanId: record.loanId,
        amount: fromPaise(pendingPaise),
        paymentDate: new Date(),
        notes: `Cleared due for ${record.periodName}`,
      },
    });

    await tx.interestRecord.update({
      where: { id: record.id },
      data: {
        paidAmount: record.amount,
        status: 'PAID',
      },
    });

    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        interestRecordId: record.id,
        amount: fromPaise(pendingPaise),
      },
    });
  });

  return res.json({ message: 'Due cleared successfully' });
}

module.exports = {
  createLoan,
  updateLoan,
  updateLoanStatus,
  deleteLoan,
  clearInterestRecord,
};
