const prisma = require('../config/db');
const { syncAllActiveLoans } = require('../services/interestService');

async function getDashboardStats(req, res) {
  try {
    // Sync all active loans before compiling dashboard metrics
    await syncAllActiveLoans();

    // Use UTC-based date strings for stable timezone-independent comparisons.
    // Prisma/Postgres stores dueDate as UTC midnight; comparing via toISOString()
    // avoids timezone-shift bugs where a date near midnight shifts to the wrong day.
    const nowUtc = new Date();
    const todayStr = nowUtc.toISOString().split('T')[0]; // e.g. '2026-08-17'

    // Calculate the date string 7 days from today
    const sevenDaysLater = new Date(nowUtc);
    sevenDaysLater.setUTCDate(sevenDaysLater.getUTCDate() + 7);
    const sevenDaysLaterStr = sevenDaysLater.toISOString().split('T')[0];

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
        // Get the date string in UTC (matches how Prisma stores the date)
        const recordDateStr = new Date(record.dueDate).toISOString().split('T')[0];

        if (pendingAmount > 0) {
          totalPendingInterest += pendingAmount;
        }

        // Calendar event metadata (include all records for the calendar view)
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
        if (recordDateStr === todayStr && pendingAmount > 0) {
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

        // Check if Overdue (due date is before today and has a pending balance)
        if (recordDateStr < todayStr && pendingAmount > 0) {
          const dayDiff = Math.floor(
            (new Date(todayStr) - new Date(recordDateStr)) / (1000 * 60 * 60 * 24)
          );
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
            daysOverdue: dayDiff,
          });
        }

        // Check if Upcoming: due date is after today and within the next 7 days, with a pending balance
        if (recordDateStr > todayStr && recordDateStr <= sevenDaysLaterStr && pendingAmount > 0) {
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

async function getMonthlyAnalytics(req, res) {
  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1;

    // --- 12-Month Trend (raw SQL for month grouping) ---
    const trend = await prisma.$queryRaw`
      SELECT
        EXTRACT(YEAR FROM "dueDate")::int  AS year,
        EXTRACT(MONTH FROM "dueDate")::int AS month,
        SUM(amount)::float                  AS "totalExpected",
        SUM("paidAmount")::float            AS "totalCollected"
      FROM "InterestRecord"
      GROUP BY year, month
      ORDER BY year, month
    `;

    // Build a full 12-month window (last 12 months from selected year/month)
    const monthlyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const found = trend.find((r) => r.year === y && r.month === m);
      monthlyTrend.push({
        year: y,
        month: m,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
        totalExpected: found ? parseFloat(found.totalExpected) : 0,
        totalCollected: found ? parseFloat(found.totalCollected) : 0,
        totalPending: found
          ? parseFloat(found.totalExpected) - parseFloat(found.totalCollected)
          : 0,
      });
    }

    // --- Selected Month Summary ---
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const selectedRecords = await prisma.interestRecord.findMany({
      where: {
        dueDate: { gte: startOfMonth, lte: endOfMonth },
      },
      include: {
        loan: {
          include: { borrower: true },
        },
      },
    });

    const selectedMonthSummary = {
      totalExpected: selectedRecords.reduce((s, r) => s + r.amount, 0),
      totalCollected: selectedRecords.reduce((s, r) => s + r.paidAmount, 0),
      totalPending: selectedRecords.reduce((s, r) => s + (r.amount - r.paidAmount), 0),
      totalRecords: selectedRecords.length,
    };

    // --- Per-Borrower Breakdown for selected month ---
    const borrowerMap = {};
    for (const record of selectedRecords) {
      const { borrower } = record.loan;
      if (!borrowerMap[borrower.id]) {
        borrowerMap[borrower.id] = {
          borrowerId: borrower.id,
          borrowerName: borrower.name,
          phone: borrower.phone,
          totalExpected: 0,
          totalCollected: 0,
          totalPending: 0,
        };
      }
      borrowerMap[borrower.id].totalExpected += record.amount;
      borrowerMap[borrower.id].totalCollected += record.paidAmount;
      borrowerMap[borrower.id].totalPending += record.amount - record.paidAmount;
    }

    const borrowerBreakdown = Object.values(borrowerMap).sort(
      (a, b) => b.totalPending - a.totalPending
    );

    return res.json({
      selectedYear: year,
      selectedMonth: month,
      monthlyTrend,
      selectedMonthSummary,
      borrowerBreakdown,
    });
  } catch (error) {
    console.error('Error fetching monthly analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch monthly analytics' });
  }
}

module.exports = {
  getDashboardStats,
  getMonthlyAnalytics,
};
