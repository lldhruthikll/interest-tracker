// Lending (DB) tests. Ported from src/tests/fifoTest.js plus FIFO, reversal and start-date edit.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const { resetDb, startServer, api } = require('./helpers');
const { getDueDatesForLoan } = require('../src/services/interestService');

let srv, token;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); await prisma.$disconnect(); });
test.beforeEach(async () => {
  await resetDb();
  const u = await prisma.user.create({ data: { username: 'owner', password: 'x', name: 'Owner', role: 'ADMIN' } });
  token = jwt.sign({ userId: u.id, username: u.username, name: u.name }, process.env.JWT_SECRET);
});

const call = (path, method, body) => api(srv.url, path, { method, token, body });

async function newLoan(startDate, monthlyInterest, today) {
  process.env.FAKE_TODAY = today;
  const b = await call('/api/borrowers', 'POST', { name: 'B', phone: '1' });
  assert.equal(b.status, 201);
  const l = await call('/api/loans', 'POST', { borrowerId: b.body.id, principal: 10000, monthlyInterest, startDate });
  assert.equal(l.status, 201, JSON.stringify(l.body));
  return { borrowerId: b.body.id, loanId: l.body.id };
}

async function dues(borrowerId) {
  const r = await call(`/api/borrowers/${borrowerId}`, 'GET');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.loans[0].interestRecords.map((x) => ({
    id: x.id, due: x.dueDate.slice(0, 10), paid: x.paidAmount, status: x.status,
  }));
}

test('due dates: monthly from the month after start, clamped to month end', () => {
  assert.deepEqual(getDueDatesForLoan('2026-03-15', '2026-06-20'), ['2026-04-15', '2026-05-15', '2026-06-15']);
  assert.deepEqual(getDueDatesForLoan('2026-01-31', '2026-04-29'), ['2026-02-28', '2026-03-31']);
  assert.deepEqual(getDueDatesForLoan('2026-12-10', '2027-01-10'), ['2027-01-10']);
  assert.deepEqual(getDueDatesForLoan('2026-06-10', '2026-07-09'), []);
});

test('FIFO payment, edit and delete restore paid amounts', async () => {
  const { borrowerId } = await newLoan('2026-04-10', 1000, '2026-06-20');
  assert.deepEqual((await dues(borrowerId)).map((d) => d.due), ['2026-05-10', '2026-06-10']);

  assert.equal((await call('/api/payments', 'POST', { borrowerId, amount: 400 })).status, 201);
  const p = await call('/api/payments', 'POST', { borrowerId, amount: 1500 });
  assert.equal(p.status, 201);
  assert.equal(p.body.payment.amount, 1500);
  assert.equal(p.body.remainingUnallocatedPayment, 0);
  let d = await dues(borrowerId);
  assert.deepEqual(d.map((x) => [x.paid, x.status]), [[1000, 'PAID'], [900, 'PARTIALLY_PAID']]);

  const allocs = await prisma.paymentAllocation.findMany({ where: { paymentId: p.body.payment.id }, orderBy: { id: 'asc' } });
  assert.deepEqual(allocs.map((a) => Number(a.amount)), [600, 900]);

  assert.equal((await call(`/api/payments/${p.body.payment.id}`, 'PUT', { amount: 700 })).status, 200);
  d = await dues(borrowerId);
  assert.deepEqual(d.map((x) => [x.paid, x.status]), [[1000, 'PAID'], [100, 'PARTIALLY_PAID']]);

  assert.equal((await call(`/api/payments/${p.body.payment.id}`, 'DELETE')).status, 200);
  d = await dues(borrowerId);
  assert.deepEqual(d.map((x) => [x.paid, x.status]), [[400, 'PARTIALLY_PAID'], [0, 'PENDING']]);

  assert.equal((await call(`/api/interest-records/${d[1].id}/clear`, 'PUT')).status, 200);
  d = await dues(borrowerId);
  assert.deepEqual(d.map((x) => [x.paid, x.status]), [[400, 'PARTIALLY_PAID'], [1000, 'PAID']]);

  assert.equal((await call('/api/payments', 'POST', { borrowerId, amount: 10.123 })).status, 400);
});

test('paise arithmetic: 0.1 + 0.2 style amounts stay exact', async () => {
  const { borrowerId } = await newLoan('2026-04-10', 0.3, '2026-05-20');
  await call('/api/payments', 'POST', { borrowerId, amount: 0.1 });
  await call('/api/payments', 'POST', { borrowerId, amount: 0.2 });
  assert.deepEqual((await dues(borrowerId)).map((x) => [x.paid, x.status]), [[0.3, 'PAID']]);
});

test('editing start date drops unpaid dues off the new schedule', async () => {
  const { borrowerId, loanId } = await newLoan('2026-07-20', 200, '2026-09-05');
  assert.deepEqual((await dues(borrowerId)).map((d) => d.due), ['2026-08-20']);
  assert.equal((await call(`/api/loans/${loanId}`, 'PUT', { startDate: '2026-07-29' })).status, 200);
  assert.deepEqual((await dues(borrowerId)).map((d) => d.due), ['2026-08-29']);
});

test('editing start date keeps dues that have any payment', async () => {
  const { borrowerId, loanId } = await newLoan('2026-07-20', 200, '2026-09-05');
  const [aug20] = await dues(borrowerId);
  assert.equal((await call(`/api/interest-records/${aug20.id}/clear`, 'PUT')).status, 200);
  assert.equal((await call(`/api/loans/${loanId}`, 'PUT', { startDate: '2026-07-29' })).status, 200);
  assert.deepEqual((await dues(borrowerId)).map((d) => [d.due, d.paid]), [['2026-08-20', 200], ['2026-08-29', 0]]);
});

test('dashboard uses IST today: a due dated today is due today, not overdue/upcoming', async () => {
  await newLoan('2026-07-20', 200, '2026-08-20');
  const r = await call('/api/dashboard', 'GET');
  assert.equal(r.status, 200);
  assert.equal(r.body.summary.todaysDueCount, 1);
  assert.equal(r.body.summary.todaysDueAmount, 200);
  assert.equal(r.body.summary.overdueCount, 0);
  assert.equal(r.body.summary.upcomingCount, 0);
});
