const { allocatePaymentFIFO, applyPaymentFIFO } = require('../services/interestService');
const { toPaise, fromPaise, parseAmountPaise } = require('../lib/money');
const { ValidationError, parseId } = require('../lib/errors');
const { requireOwned } = require('../lib/ownerDb');

async function recordPayment(req, res) {
  const { borrowerId, loanId, amount, notes, paymentDate } = req.body;

  if (!borrowerId || !amount) throw new ValidationError('Borrower ID and Amount are required');
  const amountPaise = parseAmountPaise(amount);

  const borrower = await requireOwned(req.db, 'borrower', parseId(borrowerId));
  const loan = loanId ? await requireOwned(req.db, 'loan', parseId(loanId)) : null;
  if (loan && loan.borrowerId !== borrower.id) throw new ValidationError('Loan does not belong to this borrower');

  const result = await allocatePaymentFIFO(req.db, {
    borrowerId: borrower.id,
    loanId: loan ? loan.id : null,
    amountPaise,
    notes,
    paymentDate: paymentDate || new Date(),
  });

  return res.status(201).json({
    message: 'Payment recorded and allocated successfully',
    payment: result.payment,
    allocatedRecordsCount: result.allocations.length,
    remainingUnallocatedPayment: result.remainingPayment,
  });
}

async function getPaymentHistory(req, res) {
  const { borrowerId, loanId } = req.query;

  const where = {};
  if (borrowerId) where.borrowerId = parseId(borrowerId);
  if (loanId) where.loanId = parseId(loanId);

  const payments = await req.db.payment.findMany({
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
}

/**
 * Reverses the effect of a payment's allocations on interest records.
 * Must be called inside a Prisma transaction (tx).
 */
async function reversePaymentAllocations(paymentId, tx) {
  const allocations = await tx.paymentAllocation.findMany({
    where: { paymentId },
  });

  for (const alloc of allocations) {
    // Sum allocations from all OTHER payments for this interest record
    const otherAllocations = await tx.paymentAllocation.findMany({
      where: {
        interestRecordId: alloc.interestRecordId,
        paymentId: { not: paymentId },
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
  const id = parseId(req.params.id);

  await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'payment', id);
    await reversePaymentAllocations(id, tx);
    // PaymentAllocation rows cascade-delete when payment is deleted
    await tx.payment.delete({ where: { id } });
  });

  return res.json({ message: 'Payment deleted and interest records reverted successfully' });
}

async function updatePayment(req, res) {
  const id = parseId(req.params.id);
  const { amount, notes, paymentDate } = req.body;
  const amountPaise = parseAmountPaise(amount);

  // Reverse old allocations, update the payment, then re-run FIFO, all in one transaction.
  await req.db.$transaction(async (tx) => {
    const payment = await requireOwned(tx, 'payment', id);
    await reversePaymentAllocations(id, tx);
    await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
    await tx.payment.update({
      where: { id },
      data: {
        amount: fromPaise(amountPaise),
        notes: notes !== undefined ? (notes || null) : payment.notes,
        paymentDate: paymentDate ? new Date(paymentDate) : payment.paymentDate,
      },
    });
    await applyPaymentFIFO(tx, {
      paymentId: id,
      borrowerId: payment.borrowerId,
      loanId: payment.loanId,
      amountPaise,
    });
  });

  return res.json({ message: 'Payment updated and reallocated successfully' });
}

module.exports = {
  recordPayment,
  getPaymentHistory,
  deletePayment,
  updatePayment,
};
