const prisma = require('../config/db');
const { syncAllActiveLoans } = require('../services/interestService');

async function getDashboardStats(req, res) {
  try {
    // Sync all active loans before compiling dashboard metrics
    await syncAllActiveLoans();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    sevenDaysFromNow.setHours(23, 59, 59, 999);

    // Fetch active loans with borrower and interest records
    const activeLoans = await prisma.loan.findMany({
      where: { status: 'ACTIVE' },
      include: {
        borrower: true,
        interestRecords: {
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    let totalPrincipalLent = 0;
    let totalActiveLoans = activeLoans.length;
    let totalPendingInterest = 0;

    let todaysDueAmount = 0;
    let todaysDueCount = 0;
    const todaysDueList = [];

    const overdueList = [];
    const upcomingList = [];
    const calendarEvents = [];

    for (const loan of activeLoans) {
      totalPrincipalLent += loan.principal;

      for (const record of loan.interestRecords) {
        const pendingAmount = record.amount - record.paidAmount;
        const recordDate = new Date(record.dueDate);
        recordDate.setHours(0, 0, 0, 0);

        if (pendingAmount > 0) {
          totalPendingInterest += pendingAmount;
        }

        // Calendar event metadata
        calendarEvents.push({
          id: record.id,
          title: `${loan.borrower.name} - ₹${record.amount}`,
          borrowerName: loan.borrower.name,
          borrowerPhone: loan.borrower.phone,
          amount: record.amount,
          paidAmount: record.paidAmount,
          pendingAmount: pendingAmount,
          dueDate: record.dueDate,
          periodName: record.periodName,
          status: record.status,
        });

        // Check if Due Today
        if (recordDate.getTime() === today.getTime() && pendingAmount > 0) {
          todaysDueAmount += pendingAmount;
          todaysDueCount++;
          todaysDueList.push({
            recordId: record.id,
            borrowerId: loan.borrower.id,
            borrowerName: loan.borrower.name,
            phone: loan.borrower.phone,
            loanId: loan.id,
            dueDate: record.dueDate,
            amount: record.amount,
            pendingAmount: pendingAmount,
            periodName: record.periodName,
          });
        }

        // Check if Overdue (Due date is before today and has pending balance)
        if (recordDate < today && pendingAmount > 0) {
          overdueList.push({
            recordId: record.id,
            borrowerId: loan.borrower.id,
            borrowerName: loan.borrower.name,
            phone: loan.borrower.phone,
            loanId: loan.id,
            dueDate: record.dueDate,
            amount: record.amount,
            pendingAmount: pendingAmount,
            periodName: record.periodName,
            daysOverdue: Math.floor((today - recordDate) / (1000 * 60 * 60 * 24)),
          });
        }

        // Check if Upcoming (Due date is within next 7 days, excluding today)
        if (recordDate > today && recordDate <= sevenDaysFromNow && pendingAmount > 0) {
          upcomingList.push({
            recordId: record.id,
            borrowerId: loan.borrower.id,
            borrowerName: loan.borrower.name,
            phone: loan.borrower.phone,
            loanId: loan.id,
            dueDate: record.dueDate,
            amount: record.amount,
            pendingAmount: pendingAmount,
            periodName: record.periodName,
          });
        }
      }
    }

    return res.json({
      summary: {
        todaysDueAmount,
        todaysDueCount,
        overdueCount: overdueList.length,
        totalOverdueAmount: overdueList.reduce((sum, item) => sum + item.pendingAmount, 0),
        upcomingCount: upcomingList.length,
        totalPendingInterest,
        totalPrincipalLent,
        totalActiveLoans,
      },
      todaysDue: todaysDueList,
      overdue: overdueList,
      upcoming: upcomingList,
      calendarEvents: calendarEvents,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
}

module.exports = {
  getDashboardStats,
};
