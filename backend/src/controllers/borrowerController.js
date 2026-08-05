const prisma = require('../config/db');
const { syncLoanInterestRecords, getDueDatesForLoan } = require('../services/interestService');

async function getBorrowers(req, res) {
  try {
    const { search } = req.query;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const borrowers = await prisma.borrower.findMany({
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
        let totalPrincipal = 0;
        let totalMonthlyInterest = 0;
        let totalPendingInterest = 0;
        let activeLoansCount = 0;
        let earliestNextDueDate = null;

        for (const loan of borrower.loans) {
          if (loan.status === 'ACTIVE') {
            activeLoansCount++;
            totalPrincipal += loan.principal;
            totalMonthlyInterest += loan.monthlyInterest;

            // Sync interest records
            await syncLoanInterestRecords(loan.id);

            // Fetch fresh interest records after sync
            const records = await prisma.interestRecord.findMany({
              where: { loanId: loan.id },
            });

            const pending = records.reduce((sum, r) => sum + (r.amount - r.paidAmount), 0);
            totalPendingInterest += pending;

            // Next due date calculation
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth();
            let nextDue = new Date(year, month, loan.dueDay);
            if (nextDue < today) {
              nextDue = new Date(year, month + 1, loan.dueDay);
            }

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
          totalPrincipal,
          totalMonthlyInterest,
          totalPendingInterest,
          nextDueDate: earliestNextDueDate,
        };
      })
    );

    return res.json(formattedBorrowers);
  } catch (error) {
    console.error('Error fetching borrowers:', error);
    return res.status(500).json({ error: 'Failed to fetch borrowers' });
  }
}

async function getBorrowerById(req, res) {
  try {
    const { id } = req.params;

    const borrower = await prisma.borrower.findUnique({
      where: { id: Number(id) },
      include: {
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
      },
    });

    if (!borrower) {
      return res.status(404).json({ error: 'Borrower not found' });
    }

    // Sync active loans
    for (const loan of borrower.loans) {
      if (loan.status === 'ACTIVE') {
        await syncLoanInterestRecords(loan.id);
      }
    }

    // Re-fetch borrower with synced records
    const updatedBorrower = await prisma.borrower.findUnique({
      where: { id: Number(id) },
      include: {
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
      },
    });

    let totalPrincipal = 0;
    let totalMonthlyInterest = 0;
    let totalPendingAmount = 0;
    let earliestNextDueDate = null;

    const formattedLoans = updatedBorrower.loans.map((loan) => {
      const isLoanActive = loan.status === 'ACTIVE';
      if (isLoanActive) {
        totalPrincipal += loan.principal;
        totalMonthlyInterest += loan.monthlyInterest;
      }

      const pendingForLoan = loan.interestRecords.reduce(
        (sum, r) => sum + (r.amount - r.paidAmount),
        0
      );
      if (isLoanActive) {
        totalPendingAmount += pendingForLoan;
      }

      // Next due date for this loan
      const today = new Date();
      let nextDue = new Date(today.getFullYear(), today.getMonth(), loan.dueDay);
      if (nextDue < today) {
        nextDue = new Date(today.getFullYear(), today.getMonth() + 1, loan.dueDay);
      }

      if (isLoanActive && (!earliestNextDueDate || nextDue < earliestNextDueDate)) {
        earliestNextDueDate = nextDue;
      }

      return {
        ...loan,
        pendingAmount: pendingForLoan,
        nextDueDate: nextDue,
      };
    });

    return res.json({
      ...updatedBorrower,
      loans: formattedLoans,
      summary: {
        totalPrincipal,
        totalMonthlyInterest,
        totalPendingAmount,
        nextDueDate: earliestNextDueDate,
      },
    });
  } catch (error) {
    console.error('Error fetching borrower details:', error);
    return res.status(500).json({ error: 'Failed to fetch borrower profile' });
  }
}

async function createBorrower(req, res) {
  try {
    const { name, phone, address, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and Phone are required' });
    }

    const newBorrower = await prisma.borrower.create({
      data: {
        name,
        phone,
        address: address || null,
        notes: notes || null,
      },
    });

    return res.status(201).json(newBorrower);
  } catch (error) {
    console.error('Error creating borrower:', error);
    return res.status(500).json({ error: 'Failed to create borrower' });
  }
}

async function updateBorrower(req, res) {
  try {
    const { id } = req.params;
    const { name, phone, address, notes } = req.body;

    const updated = await prisma.borrower.update({
      where: { id: Number(id) },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error updating borrower:', error);
    return res.status(500).json({ error: 'Failed to update borrower' });
  }
}

async function deleteBorrower(req, res) {
  try {
    const { id } = req.params;

    await prisma.borrower.delete({
      where: { id: Number(id) },
    });

    return res.json({ message: 'Borrower deleted successfully' });
  } catch (error) {
    console.error('Error deleting borrower:', error);
    return res.status(500).json({ error: 'Failed to delete borrower' });
  }
}

module.exports = {
  getBorrowers,
  getBorrowerById,
  createBorrower,
  updateBorrower,
  deleteBorrower,
};
