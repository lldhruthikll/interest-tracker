const prisma = require('../config/db');
const { syncLoanInterestRecords, getDueDatesForLoan } = require('../services/interestService');
const { toPaise, fromPaise, parseAmountPaise } = require('../lib/money');
const { todayIST, toDateOnly, toDbDate, isValidDateStr } = require('../lib/dates');
const { HttpError } = require('../lib/errors');

const httpError = (res, error) => res.status(error.status).json({ error: error.message });

async function createLoan(req, res) {
  try {
    const { borrowerId, principal, monthlyInterest, startDate, notes } = req.body;

    if (!borrowerId || !principal || !monthlyInterest || !startDate) {
      return res.status(400).json({
        error: 'Borrower ID, Principal, Monthly Interest, and Start Date are required',
      });
    }

    if (!isValidDateStr(startDate)) {
      return res.status(400).json({ error: 'Invalid start date format' });
    }

    const newLoan = await prisma.loan.create({
      data: {
        ownerId: req.user.id,
        borrowerId: Number(borrowerId),
        principal: fromPaise(parseAmountPaise(principal)),
        monthlyInterest: fromPaise(parseAmountPaise(monthlyInterest)),
        startDate: toDbDate(startDate),
        dueDay: Number(startDate.slice(8, 10)),
        status: 'ACTIVE',
        notes: notes || null,
      },
    });

    // Synchronise interest records immediately for this new loan
    await syncLoanInterestRecords(newLoan.id);

    const loanWithRecords = await prisma.loan.findUnique({
      where: { id: newLoan.id },
      include: { interestRecords: true },
    });

    return res.status(201).json(loanWithRecords);
  } catch (error) {
    if (error instanceof HttpError) return httpError(res, error);
    console.error('Error creating loan:', error);
    return res.status(500).json({ error: 'Failed to create loan' });
  }
}

async function updateLoan(req, res) {
  try {
    const { id } = req.params;
    const { principal, monthlyInterest, startDate, notes } = req.body;

    if (startDate && !isValidDateStr(startDate)) {
      return res.status(400).json({ error: 'Invalid start date format' });
    }

    const existing = await prisma.loan.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const updatedLoan = await prisma.loan.update({
      where: { id: Number(id) },
      data: {
        ...(principal !== undefined && { principal: fromPaise(parseAmountPaise(principal)) }),
        ...(monthlyInterest !== undefined && { monthlyInterest: fromPaise(parseAmountPaise(monthlyInterest)) }),
        ...(startDate && { startDate: toDbDate(startDate), dueDay: Number(startDate.slice(8, 10)) }),
        ...(notes !== undefined && { notes }),
      },
    });

    // Start date moved: drop unpaid dues that are no longer on the schedule. Dues with any payment are kept.
    if (startDate && startDate !== toDateOnly(existing.startDate)) {
      await prisma.interestRecord.deleteMany({
        where: {
          loanId: updatedLoan.id,
          paidAmount: 0,
          dueDate: { notIn: getDueDatesForLoan(startDate, todayIST()).map(toDbDate) },
        },
      });
    }

    if (updatedLoan.status === 'ACTIVE') {
      await syncLoanInterestRecords(updatedLoan.id);
    }

    return res.json(updatedLoan);
  } catch (error) {
    if (error instanceof HttpError) return httpError(res, error);
    console.error('Error updating loan:', error);
    return res.status(500).json({ error: 'Failed to update loan details' });
  }
}

async function updateLoanStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'ACTIVE' or 'CLOSED'

    if (!['ACTIVE', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be ACTIVE or CLOSED' });
    }

    const updatedLoan = await prisma.loan.update({
      where: { id: Number(id) },
      data: { status },
    });

    if (status === 'ACTIVE') {
      await syncLoanInterestRecords(updatedLoan.id);
    }

    return res.json(updatedLoan);
  } catch (error) {
    console.error('Error updating loan status:', error);
    return res.status(500).json({ error: 'Failed to update loan status' });
  }
}

async function deleteLoan(req, res) {
  try {
    const { id } = req.params;

    await prisma.loan.delete({
      where: { id: Number(id) },
    });

    return res.json({ message: 'Loan deleted successfully' });
  } catch (error) {
    console.error('Error deleting loan:', error);
    return res.status(500).json({ error: 'Failed to delete loan' });
  }
}

async function clearInterestRecord(req, res) {
  try {
    const { id } = req.params; // interestRecord id

    const record = await prisma.interestRecord.findUnique({
      where: { id: Number(id) },
      include: { loan: true },
    });

    if (!record) {
      return res.status(404).json({ error: 'Interest record not found' });
    }

    const pendingPaise = toPaise(record.amount) - toPaise(record.paidAmount);
    if (pendingPaise <= 0) {
      return res.status(400).json({ error: 'This record is already fully paid' });
    }

    // Allocate payment to clear this specific record
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          ownerId: record.ownerId,
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
          ownerId: record.ownerId,
          paymentId: payment.id,
          interestRecordId: record.id,
          amount: fromPaise(pendingPaise),
        },
      });
    });

    return res.json({ message: 'Due cleared successfully' });
  } catch (error) {
    console.error('Error clearing interest record:', error);
    return res.status(500).json({ error: 'Failed to clear due record' });
  }
}

module.exports = {
  createLoan,
  updateLoan,
  updateLoanStatus,
  deleteLoan,
  clearInterestRecord,
};
