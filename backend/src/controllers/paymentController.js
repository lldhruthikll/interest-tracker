const prisma = require('../config/db');
const { allocatePaymentFIFO, applyPaymentFIFO } = require('../services/interestService');
const { toPaise, fromPaise, parseAmountPaise } = require('../lib/money');
const { HttpError } = require('../lib/errors');

async function recordPayment(req, res) {
  try {
    const { borrowerId, loanId, amount, notes, paymentDate } = req.body;

    if (!borrowerId || !amount) {
      return res.status(400).json({ error: 'Borrower ID and Amount are required' });
    }

    const result = await allocatePaymentFIFO({
      ownerId: req.user.userId,
      borrowerId: Number(borrowerId),
      loanId: loanId ? Number(loanId) : null,
      amountPaise: parseAmountPaise(amount),
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
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
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

/**
 * Reverses the effect of a payment's allocations on interest records.
 * Must be called inside a Prisma transaction (tx).
 */
async function reversePaymentAllocations(paymentId, tx) {
  const allocations = await tx.paymentAllocation.findMany({
    where: { paymentId: Number(paymentId) },
  });

  for (const alloc of allocations) {
    // Sum allocations from all OTHER payments for this interest record
    const otherAllocations = await tx.paymentAllocation.findMany({
      where: {
        interestRecordId: alloc.interestRecordId,
        paymentId: { not: Number(paymentId) },
      },
    });

    const interestRecord = await tx.interestRecord.findUnique({
      where: { id: alloc.interestRecordId },
    });

    if (!interestRecord) continue;

    const newPaidPaise = otherAllocations.reduce((sum, a) => sum + toPaise(a.amount), 0);
    let newStatus;
    if (newPaidPaise <= 0) {
      newStatus = 'PENDING';
    } else if (newPaidPaise >= toPaise(interestRecord.amount)) {
      newStatus = 'PAID';
    } else {
      newStatus = 'PARTIALLY_PAID';
    }

    await tx.interestRecord.update({
      where: { id: alloc.interestRecordId },
      data: { paidAmount: fromPaise(newPaidPaise), status: newStatus },
    });
  }
}

async function deletePayment(req, res) {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({ where: { id: Number(id) } });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await prisma.$transaction(async (tx) => {
      await reversePaymentAllocations(id, tx);
      // PaymentAllocation rows cascade-delete when payment is deleted
      await tx.payment.delete({ where: { id: Number(id) } });
    });

    return res.json({ message: 'Payment deleted and interest records reverted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete payment' });
  }
}

async function updatePayment(req, res) {
  try {
    const { id } = req.params;
    const { amount, notes, paymentDate } = req.body;

    const payment = await prisma.payment.findUnique({ where: { id: Number(id) } });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const amountPaise = parseAmountPaise(amount);

    // Reverse old allocations, update the payment, then re-run FIFO, all in one transaction.
    await prisma.$transaction(async (tx) => {
      await reversePaymentAllocations(id, tx);
      await tx.paymentAllocation.deleteMany({ where: { paymentId: Number(id) } });
      await tx.payment.update({
        where: { id: Number(id) },
        data: {
          amount: fromPaise(amountPaise),
          notes: notes !== undefined ? (notes || null) : payment.notes,
          paymentDate: paymentDate ? new Date(paymentDate) : payment.paymentDate,
        },
      });
      await applyPaymentFIFO(tx, {
        paymentId: payment.id,
        ownerId: payment.ownerId,
        borrowerId: payment.borrowerId,
        loanId: payment.loanId,
        amountPaise,
      });
    });

    return res.json({ message: 'Payment updated and reallocated successfully' });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('Error updating payment:', error);
    return res.status(500).json({ error: error.message || 'Failed to update payment' });
  }
}

module.exports = {
  recordPayment,
  getPaymentHistory,
  deletePayment,
  updatePayment,
};
