const XLSX = require('xlsx');
const { syncAllActiveLoans } = require('../services/interestService');
const { toPaise } = require('../lib/money');
const { todayIST, istDate, toDateOnly } = require('../lib/dates');
const { parseId } = require('../lib/errors');
const { requireOwned } = require('../lib/ownerDb');
const { syncCategory } = require('../services/recurringSync');

async function exportExcelReport(req, res) {
  await syncAllActiveLoans(req.db);

  // 1. Pending Interest Data
  const pendingRecords = await req.db.interestRecord.findMany({
    where: {
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      loan: { status: 'ACTIVE' },
    },
    include: {
      loan: {
        include: {
          borrower: true,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  const pendingData = pendingRecords.map((r) => ({
    'Borrower Name': r.loan.borrower.name,
    'Phone': r.loan.borrower.phone,
    'Loan Principal (₹)': Number(r.loan.principal),
    'Monthly Interest (₹)': Number(r.loan.monthlyInterest),
    'Period': r.periodName,
    'Due Date': toDateOnly(r.dueDate),
    'Expected Amount (₹)': Number(r.amount),
    'Paid Amount (₹)': Number(r.paidAmount),
    'Pending Amount (₹)': (toPaise(r.amount) - toPaise(r.paidAmount)) / 100,
    'Status': r.status,
  }));

  // 2. Loans Summary Data
  const loans = await req.db.loan.findMany({
    include: {
      borrower: true,
      interestRecords: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const loansData = loans.map((l) => {
    const totalPending = l.interestRecords.reduce(
      (sum, r) => sum + toPaise(r.amount) - toPaise(r.paidAmount),
      0
    ) / 100;
    return {
      'Borrower Name': l.borrower.name,
      'Phone': l.borrower.phone,
      'Principal Amount (₹)': Number(l.principal),
      'Monthly Interest (₹)': Number(l.monthlyInterest),
      'Start Date': toDateOnly(l.startDate),
      'Due Day of Month': l.dueDay,
      'Status': l.status,
      'Total Pending Interest (₹)': totalPending,
    };
  });

  // 3. Payment History Data
  const payments = await req.db.payment.findMany({
    include: {
      borrower: true,
      allocations: {
        include: {
          interestRecord: true,
        },
      },
    },
    orderBy: { paymentDate: 'desc' },
  });

  const paymentData = payments.map((p) => {
    const periods = p.allocations
      .map((a) => `${a.interestRecord.periodName} (₹${a.amount})`)
      .join(', ');
    return {
      'Payment ID': p.id,
      'Date': istDate(p.paymentDate),
      'Borrower Name': p.borrower.name,
      'Phone': p.borrower.phone,
      'Total Amount Paid (₹)': Number(p.amount),
      'Allocated To Periods': periods || 'Unallocated / General',
      'Notes': p.notes || '',
    };
  });

  // Create Excel Workbook
  const workbook = XLSX.utils.book_new();

  const pendingSheet = XLSX.utils.json_to_sheet(pendingData);
  XLSX.utils.book_append_sheet(workbook, pendingSheet, 'Pending Interest');

  const loansSheet = XLSX.utils.json_to_sheet(loansData);
  XLSX.utils.book_append_sheet(workbook, loansSheet, 'Loans Summary');

  const paymentsSheet = XLSX.utils.json_to_sheet(paymentData);
  XLSX.utils.book_append_sheet(workbook, paymentsSheet, 'Payment History');

  // Buffer output
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=Interest_Collection_Report_${todayIST()}.xlsx`
  );

  return res.send(buffer);
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// One category's dues, payments and advances (all agreements, incl. ended).
async function exportCategory(req, res) {
  const id = parseId(req.params.id);
  const { category, agreements } = await req.db.$transaction(async (tx) => {
    const category = await requireOwned(tx, 'category', id);
    await syncCategory(tx, id);
    const agreements = await tx.agreement.findMany({ where: { unit: { place: { categoryId: id } } }, orderBy: { id: 'asc' },
      include: { unit: { include: { place: true } }, payer: true, dues: { orderBy: { period: 'asc' } },
        payments: { orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }] }, advances: { orderBy: { id: 'asc' } } } });
    return { category, agreements };
  }, { timeout: 30000 });

  const who = (a) => ({ ...(category.placeLabel && { [category.placeLabel]: a.unit.place.name }), [category.unitLabel]: a.unit.name, [category.payerLabel]: a.payer.name });
  const rows = (f) => agreements.flatMap((a) => f(a).map((r) => ({ ...who(a), ...r })));
  const sheets = {
    Dues: rows((a) => a.dues.map((d) => ({ Period: d.period, 'Due Date': toDateOnly(d.dueDate), Amount: Number(d.amount),
      Paid: Number(d.paidAmount), Status: d.status }))),
    Payments: rows((a) => a.payments.map((p) => ({ Date: toDateOnly(p.paymentDate), Amount: Number(p.amount), Method: p.method, Notes: p.notes || '' }))),
    Advances: rows((a) => a.advances.map((e) => ({ Date: toDateOnly(e.date), Type: e.type, Amount: Number(e.amount), Notes: e.notes || '' }))),
  };
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name);
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename=Category_${id}_${todayIST()}.xlsx`);
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

module.exports = {
  exportExcelReport,
  exportCategory,
};
