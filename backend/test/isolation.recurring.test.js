// Per-owner isolation: member B must never see, touch, or link to member A's recurring-income rows.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const { resetDb, startServer, api } = require('./helpers');

let srv, ta, tb, a;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); await prisma.$disconnect(); });

const as = (token) => async (method, path, body, status) => {
  const r = await api(srv.url, `/api${path}`, { method, token, body });
  if (status) assert.equal(r.status, status, `${method} ${path} → ${JSON.stringify(r.body)}`);
  return r;
};
const asA = (...x) => as(ta)(...x);
const asB = (...x) => as(tb)(...x);
const moveIn = { startDate: '2026-04-01', dueDay: 5, amount: 3000, timing: 'IN_ADVANCE', firstMonthRule: 'PRORATED', lastMonthRule: 'PRORATED' };

test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-06-10';
  const mk = (username) => prisma.user.create({ data: { username, password: 'x', name: username, role: 'MEMBER' } });
  [ta, tb] = [await mk('a'), await mk('b')].map((u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET));
  const cat = (await asA('POST', '/categories', { name: 'Rent', placeLabel: 'Building', unitLabel: 'Shop', payerLabel: 'Tenant' }, 201)).body;
  const place = (await asA('POST', `/categories/${cat.id}/places`, { name: 'A' }, 201)).body;
  const unit = (await asA('POST', `/places/${place.id}/units`, { name: 'A-1', defaultAmount: 3000 }, 201)).body;
  const payer = (await asA('POST', '/payers', { name: 'Ravi', phone: '1' }, 201)).body;
  const agr = (await asA('POST', '/agreements', { ...moveIn, unitId: unit.id, payerId: payer.id, advanceAmount: 5000 }, 201)).body;
  const pay = (await asA('POST', '/recurring-payments', { agreementId: agr.id, amount: 3000, paymentDate: '2026-04-05', method: 'CASH' }, 201)).body;
  a = { cat: cat.id, place: place.id, unit: unit.id, payer: payer.id, agr: agr.id, pay: pay.payment.id };
});

test("B's lists are empty; B gets 404 on every route addressing A's rows; A's data is untouched", async () => {
  assert.deepEqual((await asB('GET', '/categories?all=1', undefined, 200)).body, []);
  assert.deepEqual((await asB('GET', '/payers', undefined, 200)).body, []);

  const cat = (await asB('POST', '/categories', { name: 'B', placeLabel: 'L', unitLabel: 'U', payerLabel: 'P' }, 201)).body;
  const place = (await asB('POST', `/categories/${cat.id}/places`, { name: 'B' }, 201)).body;
  const bUnit = (await asB('POST', `/places/${place.id}/units`, { name: 'B-1', defaultAmount: 1 }, 201)).body;
  const bPayer = (await asB('POST', '/payers', { name: 'B-payer', phone: '2' }, 201)).body;

  const calls = [
    ['GET', `/categories/${a.cat}`], ['PUT', `/categories/${a.cat}`, { name: 'x' }], ['DELETE', `/categories/${a.cat}`],
    ['POST', `/categories/${a.cat}/places`, { name: 'x' }],
    ['PUT', `/places/${a.place}`, { name: 'x' }], ['POST', `/places/${a.place}/units`, { name: 'x', defaultAmount: 1 }],
    ['PUT', `/units/${a.unit}`, { name: 'x' }],
    ['GET', `/payers/${a.payer}`], ['PUT', `/payers/${a.payer}`, { name: 'x' }],
    ['POST', `/payers/${a.payer}/login`, { username: 'zz', password: 'password1' }],
    ['PUT', `/payers/${a.payer}/login`, { active: false }],
    ['GET', `/agreements/${a.agr}`], ['PUT', `/agreements/${a.agr}/billing`, { dueDay: 9 }],
    ['POST', `/agreements/${a.agr}/rates`, { amount: 1, effectiveFrom: '2026-06' }],
    ['POST', `/agreements/${a.agr}/advance`, { type: 'RECEIVED', amount: 1, date: '2026-06-01' }],
    ['POST', `/agreements/${a.agr}/move-out/preview`, { endDate: '2026-06-10', lastMonthRule: 'FULL' }],
    ['POST', `/agreements/${a.agr}/move-out`, { endDate: '2026-06-10', lastMonthRule: 'FULL', applyAdvance: true, retained: null }],
    ['PUT', `/recurring-payments/${a.pay}`, { amount: 1 }], ['DELETE', `/recurring-payments/${a.pay}`],
    ['POST', '/agreements', { ...moveIn, unitId: a.unit, payerId: bPayer.id }],
    ['POST', '/agreements', { ...moveIn, unitId: bUnit.id, payerId: a.payer }],
  ];
  for (const [method, path, body] of calls) {
    assert.equal((await asB(method, path, body)).status, 404, `${method} ${path} ${JSON.stringify(body)}`);
  }

  assert.equal(await prisma.agreement.count(), 1);
  assert.equal(await prisma.user.count(), 2);
  const g = (await asA('GET', `/agreements/${a.agr}`, undefined, 200)).body;
  assert.deepEqual([g.status, g.dueDay, g.advances.length, g.payments.length, g.rateChanges.length], ['ACTIVE', 5, 1, 1, 1]);
  const c = (await asA('GET', `/categories/${a.cat}`, undefined, 200)).body;
  assert.deepEqual([c.name, c.places.length, c.places[0].name, c.places[0].units.map((u) => u.name)], ['Rent', 1, 'A', ['A-1']]);
  assert.equal((await asA('GET', `/payers/${a.payer}`, undefined, 200)).body.name, 'Ravi');
  assert.deepEqual((await asB('GET', '/categories', undefined, 200)).body.map((x) => x.name), ['B']);
  assert.deepEqual((await asB('GET', '/payers', undefined, 200)).body.map((x) => x.name), ['B-payer']);
});
