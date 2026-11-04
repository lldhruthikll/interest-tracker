const { syncAllActiveLoans } = require('../services/interestService');
const { toPaise } = require('../lib/money');
const { todayIST, addDays, toDateOnly, toDbDate, clampDay } = require('../lib/dates');
const { ValidationError } = require('../lib/errors');

async function getDashboardStats(req, res) {
  // Sync all active loans before compiling dashboard metrics
  await syncAllActiveLoans(req.db);

  // Due dates are date-only values; compare 'YYYY-MM-DD' strings against today in IST.
  const todayStr = todayIST();
  const sevenDaysLaterStr = addDays(todayStr, 7);

  // Fetch active loans with borrower and interest records
  const activeLoans = await req.db.loan.findMany({
    where: { status: 'ACTIVE' },
    include: {
      borrower: true,
      interestRecords: {
        orderBy: { dueDate: 'asc' },
      },
    },
  });

  let totalPrincipalLent = 0; // paise
  let totalActiveLoans = activeLoans.length;
  let totalPendingInterest = 0; // paise

  let todaysDueAmount = 0; // paise
  let todaysDueCount = 0;
  const todaysDueList = [];

  const overdueList = [];
  const upcomingList = [];
  const calendarEvents = [];

  for (const loan of activeLoans) {
    totalPrincipalLent += toPaise(loan.principal);

    for (const record of loan.interestRecords) {
      const pendingPaise = toPaise(record.amount) - toPaise(record.paidAmount);
      const pendingAmount = pendingPaise / 100;
      const recordDateStr = toDateOnly(record.dueDate);

      if (pendingPaise > 0) {
        totalPendingInterest += pendingPaise;
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
        todaysDueAmount += pendingPaise;
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
          (toDbDate(todayStr) - toDbDate(recordDateStr)) / (1000 * 60 * 60 * 24)
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
      todaysDueAmount: todaysDueAmount / 100,
      todaysDueCount,
      overdueCount: overdueList.length,
      totalOverdueAmount: overdueList.reduce((sum, item) => sum + toPaise(item.pendingAmount), 0) / 100,
      upcomingCount: upcomingList.length,
      totalPendingInterest: totalPendingInterest / 100,
      totalPrincipalLent: totalPrincipalLent / 100,
      totalActiveLoans,
    },
    todaysDue: todaysDueList,
    overdue: overdueList,
    upcoming: upcomingList,
    calendarEvents: calendarEvents,
  });
}

async function getMonthlyAnalytics(req, res) {
  const today = todayIST();
  const { year: qy, month: qm } = req.query;
  if (qy !== undefined && !/^\d{4}$/.test(qy)) throw new ValidationError('year must be a 4-digit year');
  if (qm !== undefined && !/^(0?[1-9]|1[0-2])$/.test(qm)) throw new ValidationError('month must be 1-12');
  const year = Number(qy ?? today.slice(0, 4));
  const month = Number(qm ?? today.slice(5, 7));

  // --- 12-Month Trend (raw SQL for month grouping) ---
  const trend = await req.db.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM "dueDate")::int  AS year,
      EXTRACT(MONTH FROM "dueDate")::int AS month,
      SUM(amount)::float                  AS "totalExpected",
      SUM("paidAmount")::float            AS "totalCollected",
      (SUM(amount) - SUM("paidAmount"))::float AS "totalPending"
    FROM "InterestRecord"
    WHERE "ownerId" = ${req.user.id}
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
      totalExpected: found ? found.totalExpected : 0,
      totalCollected: found ? found.totalCollected : 0,
      totalPending: found ? found.totalPending : 0,
    });
  }

  // --- Selected Month Summary ---
  const period = `${year}-${String(month).padStart(2, '0')}`;

  const selectedRecords = await req.db.interestRecord.findMany({
    where: {
      dueDate: { gte: toDbDate(`${period}-01`), lte: toDbDate(clampDay(period, 31)) },
    },
    include: {
      loan: {
        include: { borrower: true },
      },
    },
  });

  const sumPaise = (f) => selectedRecords.reduce((s, r) => s + f(r), 0);
  const selectedMonthSummary = {
    totalExpected: sumPaise((r) => toPaise(r.amount)) / 100,
    totalCollected: sumPaise((r) => toPaise(r.paidAmount)) / 100,
    totalPending: sumPaise((r) => toPaise(r.amount) - toPaise(r.paidAmount)) / 100,
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
    // paise here; converted to rupees below
    borrowerMap[borrower.id].totalExpected += toPaise(record.amount);
    borrowerMap[borrower.id].totalCollected += toPaise(record.paidAmount);
    borrowerMap[borrower.id].totalPending += toPaise(record.amount) - toPaise(record.paidAmount);
  }

  const borrowerBreakdown = Object.values(borrowerMap).map((b) => ({
    ...b,
    totalExpected: b.totalExpected / 100,
    totalCollected: b.totalCollected / 100,
    totalPending: b.totalPending / 100,
  })).sort(
    (a, b) => b.totalPending - a.totalPending
  );

  return res.json({
    selectedYear: year,
    selectedMonth: month,
    monthlyTrend,
    selectedMonthSummary,
    borrowerBreakdown,
  });
}

module.exports = {
  getDashboardStats,
  getMonthlyAnalytics,
};
