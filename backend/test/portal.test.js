// Payer (tenant) portal: read-only, scoped to the payer's own agreements.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const { resetDb, startServer, api } = require('./helpers');

let srv, ta, p1, p2, t1, t2, owner;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); await prisma.$disconnect(); });

const A = (method, path, body, status = 200) => api(srv.url, `/api${path}`, { method, token: ta, body })
  .then((r) => { assert.equal(r.status, status, `${method} ${path} → ${JSON.stringify(r.body)}`); return r.body; });
const portal = (token, path = '/portal/me') => api(srv.url, `/api${path}`, { token });
const moveIn = { startDate: '2026-04-01', dueDay: 5, amount: 3000, timing: 'IN_ADVANCE', firstMonthRule: 'FULL', lastMonthRule: 'FULL' };

test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-06-10';
  owner = await prisma.user.create({ data: { username: 'a', password: 'x', name: 'a', role: 'MEMBER' } });
  ta = jwt.sign({ userId: owner.id }, process.env.JWT_SECRET);
  const cat = await A('POST', '/categories', { name: 'Shops', placeLabel: 'Building', unitLabel: 'Shop', payerLabel: 'Tenant' }, 201);
  const pl = await A('POST', `/categories/${cat.id}/places`, { name: 'Main Rd' }, 201);
  const unit = async (name) => A('POST', `/places/${pl.id}/units`, { name, defaultAmount: 3000 }, 201);
  const [u1, u2, u3] = [await unit('S-1'), await unit('S-2'), await unit('S-3')];
  p1 = await A('POST', '/payers', { name: 'Payer-One', phone: '111' }, 201);
  p2 = await A('POST', '/payers', { name: 'Payer-Two', phone: '222' }, 201);
  const g1 = await A('POST', '/agreements', { ...moveIn, unitId: u1.id, payerId: p1.id, advanceAmount: 1000 }, 201);
  await A('POST', '/agreements', { ...moveIn, unitId: u2.id, payerId: p1.id, amount: 4000 }, 201);
  await A('POST', '/agreements', { ...moveIn, unitId: u3.id, payerId: p2.id }, 201);
  await A('POST', '/recurring-payments', { agreementId: g1.id, amount: 3500, paymentDate: '2026-04-02', method: 'UPI' }, 201);
  const mk = (username, payerId) => prisma.user.create({ data: { username, password: 'x', name: username, role: 'PAYER', payerId } });
  [t1, t2] = [await mk('t1', p1.id), await mk('t2', p2.id)].map((u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET));
});

test('P1 sees exactly its two agreements with balances; P2 only its own; no other payer name leaks', async () => {
  const r1 = await portal(t1);
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body.payer, { name: 'Payer-One', phone: '111' });
  assert.deepEqual(r1.body.agreements.map((a) => [a.unitName, a.amount]).sort(), [['S-1', 3000], ['S-2', 4000]]);
  const a1 = r1.body.agreements.find((a) => a.unitName === 'S-1');
  assert.deepEqual([a1.categoryName, a1.placeName, a1.dueDay, a1.status, a1.startDate, a1.endDate], ['Shops', 'Main Rd', 5, 'ACTIVE', '2026-04-01', null]);
  assert.deepEqual(a1.labels, { place: 'Building', unit: 'Shop', payer: 'Tenant' });
  assert.equal(a1.dues.length, 3); // Apr, May, Jun (due 06-05 <= today)
  assert.deepEqual(a1.payments.map((p) => [p.amount, p.method, p.paymentDate]), [[3500, 'UPI', '2026-04-02']]);
  assert.deepEqual([a1.advanceHeld, a1.credit, a1.unpaid], [1000, 0, 5500]);
  assert.ok(!JSON.stringify(r1.body).includes('Payer-Two'));

  const r2 = await portal(t2);
  assert.deepEqual(r2.body.agreements.map((a) => a.unitName), ['S-3']);
  assert.ok(!JSON.stringify(r2.body).includes('Payer-One'));
});

test('PAYER is 403 on every owner route; owners are 403 on the portal', async () => {
  for (const path of ['/borrowers', '/categories', '/payers', '/overview', '/dashboard', `/payers/${p2.id}`, '/calendar?from=2026-06-01&to=2026-06-30']) {
    assert.equal((await portal(t1, path)).status, 403, path);
  }
  assert.equal((await api(srv.url, '/api/recurring-payments', { method: 'POST', token: t1, body: {} })).status, 403);
  assert.equal((await portal(ta)).status, 403);
  assert.equal((await api(srv.url, '/api/portal/me')).status, 401);
  assert.ok([403, 404].includes((await api(srv.url, '/api/portal/me', { method: 'POST', token: t1, body: {} })).status)); // read-only
});

test('PAYER must change a temporary password first', async () => {
  await prisma.user.updateMany({ where: { username: 't1' }, data: { mustChangePassword: true } });
  assert.equal((await portal(t1)).status, 403);
});
