const prisma = require('../config/db');
const { allocatePaymentFIFO } = require('../services/interestService');

async function recordPayment(req, res) {
  try {
    const { borrowerId, loanId, amount, notes, paymentDate } = req.body;

    if (!borrowerId || !amount) {
      return res.status(400).json({ error: 'Borrower ID and Amount are required' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be a positive number' });
    }

    const result = await allocatePaymentFIFO({
      borrowerId: Number(borrowerId),
      loanId: loanId ? Number(loanId) : null,
      amount: numAmount,
      notes,
      paymentDate: paymentDate || new Date(),
    });

    return res.status(201).json({
      message: 'Payment recorded and allocated successfully',
      payment: result.payment,
      allocatedRecordsCount: result.allocations.length,
      remainingUnallocatedPayment: result.remainingPayment,
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    return res.status(500).json({ error: error.message || 'Failed to record payment' });
  }
}

async function getPaymentHistory(req, res) {
  try {
    const { borrowerId, loanId } = req.query;

    const where = {};
    if (borrowerId) where.borrowerId = Number(borrowerId);
    if (loanId) where.loanId = Number(loanId);

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      include: {
        borrower: {
          select: { name: true, phone: true },
        },
        loan: {
          select: { principal: true, monthlyInterest: true },
        },
        allocations: {
          include: {
            interestRecord: {
              select: { periodName: true, dueDate: true, amount: true },
            },
          },
        },
      },
    });

    return res.json(payments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    return res.status(500).json({ error: 'Failed to fetch payment history' });
  }
}

module.exports = {
  recordPayment,
  getPaymentHistory,
};
