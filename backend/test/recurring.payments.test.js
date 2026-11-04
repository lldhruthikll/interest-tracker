// Recurring dues sync, FIFO reallocation, credit, and the recurring-payments API (spec §7 Mar 25 example).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const { forOwner } = require('../src/lib/ownerDb');
const { toDbDate } = require('../src/lib/dates');
const { syncAgreement, agreementBalances } = require('../src/services/recurringSync');
const { resetDb, startServer, api } = require('./helpers');

let srv, A, B, ta, tb, db, agr;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); await prisma.$disconnect(); });
test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-06-05';
  const mk = (username) => prisma.user.create({ data: { username, password: 'x', name: username, role: 'MEMBER' } });
  [A, B] = [await mk('a'), await mk('b')];
  [ta, tb] = [A, B].map((u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET));
  db = forOwner(A.id);
  const cat = await db.category.create({ data: { name: 'Rent', placeLabel: 'Building', unitLabel: 'Flat', payerLabel: 'Tenant' } });
  const place = await db.place.create({ data: { categoryId: cat.id, name: 'B1' } });
  const unit = await db.unit.create({ data: { placeId: place.id, name: 'F1', defaultAmount: 31000 } });
  const payer = await db.payer.create({ data: { name: 'T', phone: '1' } });
  agr = await db.agreement.create({ data: { unitId: unit.id, payerId: payer.id, startDate: toDbDate('2026-03-25'), dueDay: 5,
    timing: 'IN_ADVANCE', firstMonthRule: 'PRORATED', lastMonthRule: 'PRORATED' } });
  await db.rateChange.create({ data: { agreementId: agr.id, amount: 31000, effectiveFrom: '2026-03' } });
});

const pay = (method, path, body, token = ta) => api(srv.url, `/api/recurring-payments${path}`, { method, token, body });
const sync = (until) => db.$transaction((tx) => syncAgreement(tx, agr.id, { until }));
const dues = async () => (await db.recurringDue.findMany({ where: { agreementId: agr.id }, orderBy: { dueDate: 'asc' } }))
  .map((d) => [d.period, Number(d.amount), Number(d.paidAmount), d.status]);

test('sync, FIFO payments, edit/delete reversal, credit, rate change', async () => {
  await sync('2026-06-05');
  assert.deepEqual(await dues(), [
    ['2026-03', 7000, 0, 'PENDING'], ['2026-04', 31000, 0, 'PENDING'],
    ['2026-05', 31000, 0, 'PENDING'], ['2026-06', 31000, 0, 'PENDING']]);

  const p1 = await pay('POST', '', { agreementId: agr.id, amount: 7000, paymentDate: '2026-03-25', method: 'UPI' });
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  assert.equal((await dues())[0][3], 'PAID');

  const p2 = await pay('POST', '', { agreementId: agr.id, amount: '40000', paymentDate: '2026-04-05', method: 'CASH' });
  assert.equal(p2.status, 201);
  assert.deepEqual((await dues()).slice(1, 3), [['2026-04', 31000, 31000, 'PAID'], ['2026-05', 31000, 9000, 'PARTIALLY_PAID']]);
  assert.equal(p2.body.balances.unpaidPaise, 2200000 + 3100000);
  assert.equal(p2.body.balances.overduePaise, 2200000); // June due today is not overdue

  assert.equal((await pay('DELETE', `/${p2.body.payment.id}`)).status, 200);
  assert.deepEqual((await dues()).slice(1, 3), [['2026-04', 31000, 0, 'PENDING'], ['2026-05', 31000, 0, 'PENDING']]);

  const e = await pay('PUT', `/${p1.body.payment.id}`, { amount: 5000 });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.deepEqual((await dues())[0], ['2026-03', 7000, 5000, 'PARTIALLY_PAID']);

  // dues total 100,000; paid 5,000 + 100,000 → 5,000 credit
  const p3 = await pay('POST', '', { agreementId: agr.id, amount: 100000, paymentDate: '2026-06-05', method: 'BANK' });
  assert.equal(p3.status, 201);
  assert.ok((await dues()).every((d) => d[3] === 'PAID'));
  assert.equal(p3.body.balances.creditPaise, 500000);
  assert.equal(p3.body.balances.unpaidPaise, 0);

  await sync('2026-07-05');
  assert.deepEqual((await dues())[4], ['2026-07', 31000, 5000, 'PARTIALLY_PAID']);

  await db.rateChange.create({ data: { agreementId: agr.id, amount: 35000, effectiveFrom: '2026-07' } });
  await sync('2026-08-05');
  assert.deepEqual((await dues()).slice(4), [['2026-07', 31000, 5000, 'PARTIALLY_PAID'], ['2026-08', 35000, 0, 'PENDING']]);
});

test('move-out shrinks a paid final due; excess becomes credit', async () => {
  // reuse the fixture agreement (one agreement per unit): start 2026-04-01, ₹3,000/month
  await db.agreement.update({ where: { id: agr.id }, data: { startDate: toDbDate('2026-04-01') } });
  await db.rateChange.updateMany({ where: { agreementId: agr.id }, data: { amount: 3000, effectiveFrom: '2026-04' } });
  await sync('2026-06-05');
  const p = await pay('POST', '', { agreementId: agr.id, amount: 9000, paymentDate: '2026-06-05', method: 'CASH' });
  assert.equal(p.status, 201);
  assert.ok((await dues()).every((d) => d[1] === 3000 && d[3] === 'PAID'));

  await db.agreement.update({ where: { id: agr.id }, data: { status: 'ENDED', endDate: toDbDate('2026-06-10') } });
  await sync('2026-06-05');
  assert.deepEqual((await dues())[2], ['2026-06', 1000, 1000, 'PAID']);
  assert.equal((await db.$transaction((tx) => agreementBalances(tx, agr.id))).creditPaise, 200000);
});

test('validation: amount, dates, method, ended agreement', async () => {
  const ok = { agreementId: agr.id, amount: 100, paymentDate: '2026-04-01', method: 'CASH' };
  const bad = [
    { amount: 0 }, { amount: -1 }, { amount: 'abc' }, { amount: '10.123' },
    { paymentDate: '2026-03-24' }, // before startDate
    { paymentDate: '2026-02-30' }, { paymentDate: 'x' },
    { paymentDate: '2026-06-06' }, // future (today is 2026-06-05)
    { method: 'ADVANCE' }, { method: 'GOLD' },
  ];
  for (const b of bad) assert.equal((await pay('POST', '', { ...ok, ...b })).status, 400, JSON.stringify(b));

  const p = await pay('POST', '', ok);
  assert.equal(p.status, 201);
  for (const b of bad) assert.equal((await pay('PUT', `/${p.body.payment.id}`, b)).status, 400, `PUT ${JSON.stringify(b)}`);

  await db.agreement.update({ where: { id: agr.id }, data: { status: 'ENDED', endDate: toDbDate('2026-05-31') } });
  assert.equal((await pay('POST', '', { ...ok, paymentDate: '2026-06-01' })).status, 400);
  assert.equal((await pay('POST', '', { ...ok, paymentDate: '2026-05-31' })).status, 201);
  assert.equal(await db.recurringPayment.count(), 2);
  assert.deepEqual((await dues()).map((d) => d[0]), ['2026-03', '2026-04', '2026-05']); // ENDED: June due removed
});

test("B cannot pay, edit or delete on A's agreement", async () => {
  const p = await pay('POST', '', { agreementId: agr.id, amount: 100, paymentDate: '2026-04-01', method: 'CASH' });
  assert.equal((await pay('POST', '', { agreementId: agr.id, amount: 100, paymentDate: '2026-04-01', method: 'CASH' }, tb)).status, 404);
  assert.equal((await pay('PUT', `/${p.body.payment.id}`, { amount: 1 }, tb)).status, 404);
  assert.equal((await pay('DELETE', `/${p.body.payment.id}`, undefined, tb)).status, 404);
  assert.equal(await prisma.recurringPayment.count(), 1);
});
