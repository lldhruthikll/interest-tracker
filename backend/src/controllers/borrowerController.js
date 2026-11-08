const { syncLoanInterestRecords } = require('../services/interestService');
const { toPaise } = require('../lib/money');
const { todayIST, toDbDate, periodOf, addMonths, clampDay } = require('../lib/dates');
const { parseId, ValidationError } = require('../lib/errors');

// Next due date for a loan's due day, today (IST) counting as not yet passed.
function nextDueFor(dueDay, today) {
  const thisMonth = clampDay(periodOf(today), dueDay);
  return thisMonth >= today ? thisMonth : clampDay(addMonths(periodOf(today), 1), dueDay);
}

const pendingPaise = (records) => records.reduce((sum, r) => sum + toPaise(r.amount) - toPaise(r.paidAmount), 0);

async function getBorrowers(req, res) {
  const { search } = req.query;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};

  const borrowers = await req.db.borrower.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      loans: {
        include: {
          interestRecords: true,
        },
      },
      payments: {
        orderBy: { paymentDate: 'desc' },
        take: 5,
      },
    },
  });

  // Sync interest records for active loans and format response
  const formattedBorrowers = await Promise.all(
    borrowers.map(async (borrower) => {
      let totalPrincipal = 0; // paise
      let totalMonthlyInterest = 0; // paise
      let totalPendingInterest = 0; // paise
      let activeLoansCount = 0;
      let earliestNextDueDate = null;
      const today = todayIST();

      for (const loan of borrower.loans) {
        if (loan.status === 'ACTIVE') {
          activeLoansCount++;
          totalPrincipal += toPaise(loan.principal);
          totalMonthlyInterest += toPaise(loan.monthlyInterest);

          // Sync interest records
          await syncLoanInterestRecords(req.db, loan.id);

          // Fetch fresh interest records after sync
          const records = await req.db.interestRecord.findMany({
            where: { loanId: loan.id },
          });

          totalPendingInterest += pendingPaise(records);

          const nextDue = nextDueFor(loan.dueDay, today);
          if (!earliestNextDueDate || nextDue < earliestNextDueDate) {
            earliestNextDueDate = nextDue;
          }
        }
      }

      return {
        id: borrower.id,
        name: borrower.name,
        phone: borrower.phone,
        address: borrower.address,
        notes: borrower.notes,
        createdAt: borrower.createdAt,
        activeLoansCount,
        totalPrincipal: totalPrincipal / 100,
        totalMonthlyInterest: totalMonthlyInterest / 100,
        totalPendingInterest: totalPendingInterest / 100,
        nextDueDate: earliestNextDueDate && toDbDate(earliestNextDueDate),
      };
    })
  );

  return res.json(formattedBorrowers);
}

const profileInclude = {
  loans: {
    orderBy: { startDate: 'desc' },
    include: {
      interestRecords: {
        orderBy: { dueDate: 'asc' },
      },
    },
  },
  payments: {
    orderBy: { paymentDate: 'desc' },
    include: {
      allocations: {
        include: {
          interestRecord: true,
        },
      },
    },
  },
};

async function getBorrowerById(req, res) {
  const id = parseId(req.params.id);

  const borrower = await req.db.borrower.findUnique({ where: { id }, include: { loans: true } });
  if (!borrower) {
    return res.status(404).json({ error: 'Borrower not found' });
  }

  // Sync active loans
  for (const loan of borrower.loans) {
    if (loan.status === 'ACTIVE') {
      await syncLoanInterestRecords(req.db, loan.id);
    }
  }

  // Re-fetch borrower with synced records
  const updatedBorrower = await req.db.borrower.findUnique({ where: { id }, include: profileInclude });

  let totalPrincipal = 0; // paise
  let totalMonthlyInterest = 0; // paise
  let totalPendingAmount = 0; // paise
  let earliestNextDueDate = null;
  const today = todayIST();

  const formattedLoans = updatedBorrower.loans.map((loan) => {
    const isLoanActive = loan.status === 'ACTIVE';
    if (isLoanActive) {
      totalPrincipal += toPaise(loan.principal);
      totalMonthlyInterest += toPaise(loan.monthlyInterest);
    }

    const pendingForLoan = pendingPaise(loan.interestRecords);
    if (isLoanActive) {
      totalPendingAmount += pendingForLoan;
    }

    const nextDue = nextDueFor(loan.dueDay, today);

    if (isLoanActive && (!earliestNextDueDate || nextDue < earliestNextDueDate)) {
      earliestNextDueDate = nextDue;
    }

    return {
      ...loan,
      pendingAmount: pendingForLoan / 100,
      nextDueDate: toDbDate(nextDue),
    };
  });

  return res.json({
    ...updatedBorrower,
    loans: formattedLoans,
    summary: {
      totalPrincipal: totalPrincipal / 100,
      totalMonthlyInterest: totalMonthlyInterest / 100,
      totalPendingAmount: totalPendingAmount / 100,
      nextDueDate: earliestNextDueDate && toDbDate(earliestNextDueDate),
    },
  });
}

async function createBorrower(req, res) {
  const { name, phone, address, notes } = req.body;

  if (!name || !phone) throw new ValidationError('Name and Phone are required');

  const newBorrower = await req.db.borrower.create({
    data: {
      name,
      phone,
      address: address || null,
      notes: notes || null,
    },
  });

  return res.status(201).json(newBorrower);
}

async function updateBorrower(req, res) {
  const id = parseId(req.params.id);
  const { name, phone, address, notes, smsReminders } = req.body;
  if (smsReminders !== undefined && typeof smsReminders !== 'boolean') throw new ValidationError('smsReminders must be true or false');

  // Not owned -> P2025 -> 404
  const updated = await req.db.borrower.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(address !== undefined && { address }),
      ...(notes !== undefined && { notes }),
      ...(smsReminders !== undefined && { smsReminders }),
    },
  });

  return res.json(updated);
}

async function deleteBorrower(req, res) {
  await req.db.borrower.delete({ where: { id: parseId(req.params.id) } }); // not owned -> P2025 -> 404
  return res.json({ message: 'Borrower deleted successfully' });
}

module.exports = {
  getBorrowers,
  getBorrowerById,
  createBorrower,
  updateBorrower,
  deleteBorrower,
};
