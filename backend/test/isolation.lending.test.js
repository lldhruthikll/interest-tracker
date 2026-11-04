// Per-owner isolation: member B must never see or touch member A's lending data.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const { resetDb, startServer, api } = require('./helpers');

let srv, A, B, ta, tb, aIds;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); await prisma.$disconnect(); });
test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-06-20';
  const mk = (username, role = 'MEMBER') => prisma.user.create({ data: { username, password: 'x', name: username, role } });
  [A, B] = [await mk('a'), await mk('b')];
  [ta, tb] = [A, B].map((u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET));
  const b = await asA('/api/borrowers', 'POST', { name: 'A-borrower', phone: '1' });
  const l = await asA('/api/loans', 'POST', { borrowerId: b.body.id, principal: 10000, monthlyInterest: 1000, startDate: '2026-04-10' });
  const p = await asA('/api/payments', 'POST', { borrowerId: b.body.id, amount: 400 });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  aIds = { borrower: b.body.id, loan: l.body.id, payment: p.body.payment.id, record: l.body.interestRecords[1].id };
});

const asA = (path, method, body) => api(srv.url, path, { method, token: ta, body });
const asB = (path, method, body) => api(srv.url, path, { method, token: tb, body });

test("B gets 404 on every route addressing A's rows, and A's data is untouched", async () => {
  const calls = [
    ['GET', `/api/borrowers/${aIds.borrower}`],
    ['PUT', `/api/borrowers/${aIds.borrower}`, { name: 'hacked' }],
    ['DELETE', `/api/borrowers/${aIds.borrower}`],
    ['PUT', `/api/loans/${aIds.loan}`, { notes: 'hacked' }],
    ['PUT', `/api/loans/${aIds.loan}/status`, { status: 'CLOSED' }],
    ['DELETE', `/api/loans/${aIds.loan}`],
    ['PUT', `/api/payments/${aIds.payment}`, { amount: 1 }],
    ['DELETE', `/api/payments/${aIds.payment}`],
    ['PUT', `/api/interest-records/${aIds.record}/clear`],
  ];
  for (const [method, path, body] of calls) {
    assert.equal((await asB(path, method, body)).status, 404, `${method} ${path}`);
  }
  const borrower = await prisma.borrower.findUnique({ where: { id: aIds.borrower }, include: { loans: true } });
  assert.equal(borrower.name, 'A-borrower');
  assert.equal(borrower.loans[0].status, 'ACTIVE');
  assert.equal(borrower.loans[0].notes, null);
  assert.equal(Number((await prisma.payment.findUnique({ where: { id: aIds.payment } })).amount), 400);
  assert.equal(Number((await prisma.interestRecord.findUnique({ where: { id: aIds.record } })).paidAmount), 0);
});

test("B's lists and dashboard are empty", async () => {
  assert.deepEqual((await asB('/api/borrowers', 'GET')).body, []);
  assert.deepEqual((await asB('/api/payments', 'GET')).body, []);
  const d = await asB('/api/dashboard', 'GET');
  assert.equal(d.status, 200);
  assert.deepEqual(
    [d.body.summary.totalPrincipalLent, d.body.summary.totalPendingInterest, d.body.summary.totalActiveLoans, d.body.calendarEvents.length],
    [0, 0, 0, 0]
  );
  // sanity: A sees its own data
  assert.equal((await asA('/api/dashboard', 'GET')).body.summary.totalPrincipalLent, 10000);
});

test("B cannot link creates to A's parents (404, nothing created)", async () => {
  const before = { loans: await prisma.loan.count(), payments: await prisma.payment.count() };
  const l = await asB('/api/loans', 'POST', { borrowerId: aIds.borrower, principal: 1, monthlyInterest: 1, startDate: '2026-01-01' });
  assert.equal(l.status, 404);
  assert.equal((await asB('/api/payments', 'POST', { borrowerId: aIds.borrower, amount: 5 })).status, 404);
  const own = await asB('/api/borrowers', 'POST', { name: 'B-borrower', phone: '2' });
  assert.equal(own.status, 201);
  assert.equal((await asB('/api/payments', 'POST', { borrowerId: own.body.id, loanId: aIds.loan, amount: 5 })).status, 404);
  assert.deepEqual({ loans: await prisma.loan.count(), payments: await prisma.payment.count() }, before);
});

test("B's monthly analytics trend is all zeros", async () => {
  const a = await asA('/api/analytics/monthly?year=2026&month=6', 'GET');
  assert.equal(a.body.monthlyTrend.find((m) => m.month === 5).totalExpected, 1000);
  const r = await asB('/api/analytics/monthly?year=2026&month=6', 'GET');
  assert.equal(r.status, 200);
  for (const m of r.body.monthlyTrend) assert.deepEqual([m.totalExpected, m.totalCollected, m.totalPending], [0, 0, 0]);
  assert.equal(r.body.selectedMonthSummary.totalRecords, 0);
  assert.deepEqual(r.body.borrowerBreakdown, []);
});

test('forOwner applies inside interactive transactions', async () => {
  const { forOwner } = require('../src/lib/ownerDb');
  const db = forOwner(B.id);
  await db.$transaction(async (tx) => {
    assert.deepEqual(await tx.borrower.findMany(), []);
    assert.equal(await tx.borrower.findUnique({ where: { id: aIds.borrower } }), null);
    assert.equal(await tx.interestRecord.count(), 0);
    const created = await tx.borrower.create({ data: { name: 'tx', phone: '3' } });
    assert.equal(created.ownerId, B.id);
  });
});

test('PAYER cannot use lending routes', async () => {
  const p = await prisma.user.create({ data: { username: 'p', password: 'x', name: 'p', role: 'PAYER' } });
  const t = jwt.sign({ userId: p.id }, process.env.JWT_SECRET);
  assert.equal((await api(srv.url, '/api/borrowers', { token: t })).status, 403);
});

test('invalid ids and analytics params -> 400', async () => {
  assert.equal((await asA('/api/borrowers/abc', 'GET')).status, 400);
  assert.equal((await asA('/api/payments/1.5', 'DELETE')).status, 400);
  assert.equal((await asA('/api/analytics/monthly?month=13', 'GET')).status, 400);
  assert.equal((await asA('/api/analytics/monthly?year=26', 'GET')).status, 400);
  const admin = await prisma.user.create({ data: { username: 'boss', password: 'x', name: 'boss', role: 'ADMIN' } });
  const t = jwt.sign({ userId: admin.id }, process.env.JWT_SECRET);
  assert.equal((await api(srv.url, '/api/admin/members/abc', { method: 'PUT', token: t, body: { active: false } })).status, 400);
});
