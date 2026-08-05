const XLSX = require('xlsx');
const prisma = require('../config/db');
const { syncAllActiveLoans } = require('../services/interestService');

async function exportExcelReport(req, res) {
  try {
    await syncAllActiveLoans();

    // 1. Pending Interest Data
    const pendingRecords = await prisma.interestRecord.findMany({
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
      'Loan Principal (₹)': r.loan.principal,
      'Monthly Interest (₹)': r.loan.monthlyInterest,
      'Period': r.periodName,
      'Due Date': new Date(r.dueDate).toISOString().split('T')[0],
      'Expected Amount (₹)': r.amount,
      'Paid Amount (₹)': r.paidAmount,
      'Pending Amount (₹)': r.amount - r.paidAmount,
      'Status': r.status,
    }));

    // 2. Loans Summary Data
    const loans = await prisma.loan.findMany({
      include: {
        borrower: true,
        interestRecords: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const loansData = loans.map((l) => {
      const totalPending = l.interestRecords.reduce(
        (sum, r) => sum + (r.amount - r.paidAmount),
        0
      );
      return {
        'Borrower Name': l.borrower.name,
        'Phone': l.borrower.phone,
        'Principal Amount (₹)': l.principal,
        'Monthly Interest (₹)': l.monthlyInterest,
        'Start Date': new Date(l.startDate).toISOString().split('T')[0],
        'Due Day of Month': l.dueDay,
        'Status': l.status,
        'Total Pending Interest (₹)': totalPending,
      };
    });

    // 3. Payment History Data
    const payments = await prisma.payment.findMany({
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
        'Date': new Date(p.paymentDate).toISOString().split('T')[0],
        'Borrower Name': p.borrower.name,
        'Phone': p.borrower.phone,
        'Total Amount Paid (₹)': p.amount,
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
      `attachment; filename=Interest_Collection_Report_${new Date().toISOString().split('T')[0]}.xlsx`
    );

    return res.send(buffer);
  } catch (error) {
    console.error('Error generating Excel report:', error);
    return res.status(500).json({ error: 'Failed to generate Excel report' });
  }
}

module.exports = {
  exportExcelReport,
};
