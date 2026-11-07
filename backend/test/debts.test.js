// Money I owe: creditor balances, rent payments passed on (capped, edited, deleted), pre-fill, isolation.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const { resetDb, startServer, api } = require('./helpers');

let srv, ta, tb, ids;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); await prisma.$disconnect(); });

const as = (token) => async (method, path, body, status = 200) => {
  const r = await api(srv.url, `/api${path}`, { method, token, body });
  assert.equal(r.status, status, `${method} ${path} → ${JSON.stringify(r.body)}`);
  return r.body;
};
const pay = (agreementId, amount, repayTo, paymentDate = '2026-06-05') =>
  as(ta)('POST', '/recurring-payments', { agreementId, amount, paymentDate, method: 'CASH', repayTo }, 201);
const person = async (id) => as(ta)('GET', `/creditors/${id}`);

test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-06-10';
  const mk = (u) => prisma.user.create({ data: { username: u, password: 'x', name: u, role: 'MEMBER' } });
  const [A, B] = [await mk('a'), await mk('b')];
  ta = jwt.sign({ userId: A.id }, process.env.JWT_SECRET);
  tb = jwt.sign({ userId: B.id }, process.env.JWT_SECRET);
  const ok = as(ta);
  const cat = await ok('POST', '/categories', { name: 'Rent', placeLabel: 'Building', unitLabel: 'Shop', payerLabel: 'Tenant' }, 201);
  const place = await ok('POST', `/categories/${cat.id}/places`, { name: 'Building A' }, 201);
  const agree = async (name, tenant) => {
    const u = await ok('POST', `/places/${place.id}/units`, { name, defaultAmount: 7500 }, 201);
    return (await ok('POST', '/agreements', { unitId: u.id, newPayer: { name: tenant, phone: '1' }, startDate: '2026-01-01',
      dueDay: 5, amount: 7500, timing: 'IN_ADVANCE', firstMonthRule: 'FULL', lastMonthRule: 'FULL' }, 201)).id;
  };
  ids = { a1: await agree('A-1', 'Ravi'), a2: await agree('A-2', 'Sita') };
});

test('creditor balance: borrowed, own-money repayment, never below zero, log lines', async () => {
  const ok = as(ta);
  const asif = await ok('POST', '/creditors', { name: 'Asif', phone: '98', amount: 200000, date: '2026-01-01' }, 201);
  await ok('POST', `/creditors/${asif.id}/entries`, { type: 'REPAID', amount: 10000, date: '2026-02-01' }, 201);
  await ok('POST', `/creditors/${asif.id}/entries`, { type: 'REPAID', amount: 190001 }, 400); // more than left
  const p = await person(asif.id);
  assert.deepEqual([p.borrowed, p.repaid, p.left, p.lastPaid], [200000, 10000, 190000, '2026-02-01']);
  assert.deepEqual(p.entries.map((e) => e.message), ['Repaid (own money)', 'Borrowed']);

  const borrowed = p.entries.find((e) => e.type === 'BORROWED');
  await ok('DELETE', `/debt-entries/${borrowed.id}`, undefined, 409); // would go negative
  await ok('POST', '/creditors', { name: 'X', amount: 0 }, 400);
  await ok('POST', '/creditors', { name: ' ', amount: 5 }, 400);
});

test('rent payment passed on: log message, capped at what is left, pre-fill, edit and delete follow', async () => {
  const ok = as(ta);
  // new person created from the rent box; tenant pays 7,500 but only 5,000 is owed
  const first = await pay(ids.a1, 7500, { newCreditor: { name: 'Asif', amount: 5000 } });
  assert.equal(first.repayment.amount, 5000);
  const asifId = first.repayment.creditorId;
  let p = await person(asifId);
  assert.deepEqual([p.left, p.entries[0].message], [0, 'Rent from A-1, Building A (Ravi) paid to Asif']);
  assert.equal(p.entries[0].agreementId, ids.a1);

  // cleared: no pre-fill, and linking again is refused (payment not saved either)
  assert.equal((await ok('GET', `/agreements/${ids.a1}`)).suggestedCreditorId, null);
  await ok('POST', '/recurring-payments', { agreementId: ids.a1, amount: 7500, paymentDate: '2026-06-05', repayTo: { creditorId: asifId } }, 400);
  assert.equal((await ok('GET', `/agreements/${ids.a1}`)).payments.length, 1);

  // borrow more → pre-fill comes back for this tenant only
  await ok('POST', `/creditors/${asifId}/entries`, { type: 'BORROWED', amount: 20000 }, 201);
  assert.equal((await ok('GET', `/agreements/${ids.a1}`)).suggestedCreditorId, asifId);
  assert.equal((await ok('GET', `/agreements/${ids.a2}`)).suggestedCreditorId, null);

  const second = await pay(ids.a1, 7500, { creditorId: asifId });
  assert.equal((await person(asifId)).left, 12500);

  // edit amount: link follows (re-capped); edit to null: link removed; delete payment: line removed
  await ok('PUT', `/recurring-payments/${second.payment.id}`, { amount: 3000 });
  assert.equal((await person(asifId)).left, 17000);
  await ok('PUT', `/recurring-payments/${second.payment.id}`, { repayTo: null });
  assert.equal((await person(asifId)).left, 20000);
  await ok('PUT', `/recurring-payments/${second.payment.id}`, { repayTo: { creditorId: asifId } });
  assert.equal((await person(asifId)).left, 17000);
  const line = (await person(asifId)).entries.find((e) => e.agreementId);
  await ok('DELETE', `/debt-entries/${line.id}`, undefined, 409); // only through the payment
  await ok('DELETE', `/recurring-payments/${second.payment.id}`);
  assert.equal((await person(asifId)).left, 20000);

  // bad new person → whole payment rolled back
  await ok('POST', '/recurring-payments', { agreementId: ids.a2, amount: 7500, paymentDate: '2026-06-05', repayTo: { newCreditor: { name: 'Y' } } }, 400);
  assert.equal((await ok('GET', `/agreements/${ids.a2}`)).payments.length, 0);
});

test('dashboard totals and order; isolation between members', async () => {
  const ok = as(ta);
  const asif = await ok('POST', '/creditors', { name: 'Asif', amount: 200000, date: '2026-01-01' }, 201);
  const zed = await ok('POST', '/creditors', { name: 'Ali', amount: 1000, date: '2026-01-01' }, 201);
  await ok('POST', `/creditors/${zed.id}/entries`, { type: 'REPAID', amount: 1000, date: '2026-05-01' }, 201);
  await pay(ids.a1, 7500, { creditorId: asif.id });
  const d = await ok('GET', '/creditors');
  assert.deepEqual(d.totals, { owed: 192500, repaid: 8500, repaidThisMonth: 7500 });
  assert.deepEqual(d.creditors.map((c) => [c.name, c.left]), [['Asif', 192500], ['Ali', 0]]); // cleared last

  const other = as(tb);
  assert.deepEqual((await other('GET', '/creditors')).creditors, []);
  await other('GET', `/creditors/${asif.id}`, undefined, 404);
  await other('POST', `/creditors/${asif.id}/entries`, { type: 'REPAID', amount: 1 }, 404);
});
