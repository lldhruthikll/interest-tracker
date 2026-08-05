const prisma = require('../config/db');
const { syncLoanInterestRecords } = require('../services/interestService');

async function createLoan(req, res) {
  try {
    const { borrowerId, principal, monthlyInterest, startDate, notes } = req.body;

    if (!borrowerId || !principal || !monthlyInterest || !startDate) {
      return res.status(400).json({
        error: 'Borrower ID, Principal, Monthly Interest, and Start Date are required',
      });
    }

    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ error: 'Invalid start date format' });
    }

    const dueDay = start.getDate();

    const newLoan = await prisma.loan.create({
      data: {
        borrowerId: Number(borrowerId),
        principal: Number(principal),
        monthlyInterest: Number(monthlyInterest),
        startDate: start,
        dueDay: dueDay,
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
    console.error('Error creating loan:', error);
    return res.status(500).json({ error: 'Failed to create loan' });
  }
}

async function updateLoan(req, res) {
  try {
    const { id } = req.params;
    const { principal, monthlyInterest, startDate, notes } = req.body;

    const start = startDate ? new Date(startDate) : undefined;
    const dueDay = start ? start.getDate() : undefined;

    const updatedLoan = await prisma.loan.update({
      where: { id: Number(id) },
      data: {
        ...(principal !== undefined && { principal: Number(principal) }),
        ...(monthlyInterest !== undefined && { monthlyInterest: Number(monthlyInterest) }),
        ...(start && { startDate: start, dueDay }),
        ...(notes !== undefined && { notes }),
      },
    });

    if (updatedLoan.status === 'ACTIVE') {
      await syncLoanInterestRecords(updatedLoan.id);
    }

    return res.json(updatedLoan);
  } catch (error) {
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

    const pendingAmount = record.amount - record.paidAmount;
    if (pendingAmount <= 0) {
      return res.status(400).json({ error: 'This record is already fully paid' });
    }

    // Allocate payment to clear this specific record
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          borrowerId: record.loan.borrowerId,
          loanId: record.loanId,
          amount: pendingAmount,
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
          amount: pendingAmount,
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
