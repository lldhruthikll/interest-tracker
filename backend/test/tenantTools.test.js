// Previous balance on agreements, delete rules for categories/groups/units, sidebar search.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const smsPush = require('../src/lib/smsPush');
const { resetDb, startServer, api } = require('./helpers');

let srv, ta, tb, ids;
const realSend = smsPush.sendSms;
test.before(async () => { srv = await startServer(); });
test.after(async () => { smsPush.sendSms = realSend; await srv.close(); await prisma.$disconnect(); });

const as = (token) => async (method, path, body, status = 200) => {
  const r = await api(srv.url, `/api${path}`, { method, token, body });
  assert.equal(r.status, status, `${method} ${path} → ${JSON.stringify(r.body)}`);
  return r.body;
};
const moveIn = (unitId, extra) => as(ta)('POST', '/agreements', { unitId, newPayer: { name: 'Ravi', phone: '9840012345' },
  startDate: '2026-06-01', dueDay: 5, amount: 3000, timing: 'IN_ADVANCE', firstMonthRule: 'FULL', lastMonthRule: 'FULL', ...extra }, 201);
const opening = (ag) => ag.dues.find((d) => d.period === '0000-00');

test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-06-10';
  const mk = (u) => prisma.user.create({ data: { username: u, password: 'x', name: u, role: 'MEMBER', smsReminders: true } });
  const [A, B] = [await mk('a'), await mk('b')];
  [ta, tb] = [A, B].map((u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET));
  const ok = as(ta);
  const cat = await ok('POST', '/categories', { name: 'Commercial Rent', placeLabel: 'Building', unitLabel: 'Shop', payerLabel: 'Tenant' }, 201);
  const pa = await ok('POST', `/categories/${cat.id}/places`, { name: 'Building A' }, 201);
  const pb = await ok('POST', `/categories/${cat.id}/places`, { name: 'Building B' }, 201);
  const u1 = await ok('POST', `/places/${pa.id}/units`, { name: 'A-1', defaultAmount: 3000 }, 201);
  const u2 = await ok('POST', `/places/${pa.id}/units`, { name: 'A-2', defaultAmount: 3000 }, 201);
  const u3 = await ok('POST', `/places/${pb.id}/units`, { name: 'B-1', defaultAmount: 3000 }, 201);
  ids = { cat: cat.id, pa: pa.id, pb: pb.id, u1: u1.id, u2: u2.id, u3: u3.id };
});

test('previous balance at move-in: counted as unpaid, paid first, survives a billing change', async () => {
  const ok = as(ta);
  const ag = await moveIn(ids.u1, { previousBalance: 35000 });
  assert.deepEqual([opening(ag).amount, ag.balances.unpaidPaise / 100], [35000, 38000]); // + June ₹3,000

  await ok('POST', '/recurring-payments', { agreementId: ag.id, amount: 36000, paymentDate: '2026-06-08', method: 'CASH' }, 201);
  let a = await ok('GET', `/agreements/${ag.id}`);
  assert.deepEqual([opening(a).paidAmount, opening(a).status], [35000, 'PAID']);
  assert.deepEqual(a.dues.filter((d) => d.period === '2026-06').map((d) => [d.paidAmount, d.status]), [[1000, 'PARTIALLY_PAID']]);

  await ok('PUT', `/agreements/${ag.id}/billing`, { dueDay: 7 });
  a = await ok('GET', `/agreements/${ag.id}`);
  assert.equal(opening(a).amount, 35000);
  assert.equal(a.balances.unpaidPaise / 100, 2000);
});

test('previous balance on an existing tenant: add, change, remove; validation; other owners get 404', async () => {
  const ok = as(ta);
  const ag = await moveIn(ids.u1);
  assert.equal(opening(ag), undefined);
  let a = await ok('PUT', `/agreements/${ag.id}/previous-balance`, { amount: 35000 });
  assert.deepEqual([opening(a).amount, a.balances.unpaidPaise / 100], [35000, 38000]);
  a = await ok('PUT', `/agreements/${ag.id}/previous-balance`, { amount: '20000.50' });
  assert.equal(opening(a).amount, 20000.5);
  a = await ok('PUT', `/agreements/${ag.id}/previous-balance`, { amount: 0 });
  assert.deepEqual([opening(a), a.balances.unpaidPaise / 100], [undefined, 3000]);
  await ok('PUT', `/agreements/${ag.id}/previous-balance`, { amount: 'abc' }, 400);
  await as(tb)('PUT', `/agreements/${ag.id}/previous-balance`, { amount: 100 }, 404);
});

test('SMS: previous balance shows as earlier unpaid, never as a due of its own', async () => {
  process.env.FAKE_TODAY = '2026-06-05';
  Object.assign(process.env, { JOB_SECRET: 'job-key', SMS_DEVICE_TOKEN: 'd', SMS_SECRET: 's',
    SMS_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'p', client_email: 'x@p', private_key: 'k' }) });
  const calls = [];
  smsPush.sendSms = async (a) => { calls.push(a); return { id: a.id }; };
  await moveIn(ids.u1, { previousBalance: 35000 });
  await moveIn(ids.u2, { startDate: '2026-06-05', previousBalance: 1000, newPayer: { name: 'Sita', phone: '9811122233' } }); // opening due dated today
  const r = await fetch(`${srv.url}/api/jobs/rent-reminders`, { method: 'POST', headers: { 'X-Job-Key': 'job-key' } });
  assert.equal(r.status, 200);
  assert.deepEqual(calls.map((c) => c.text).sort(), [
    'Hi Ravi, your Jun 2026 rent of ₹3,000 for A-1 is due today. Earlier unpaid rent: ₹35,000. Total due: ₹38,000.',
    'Hi Sita, your Jun 2026 rent of ₹3,000 for A-2 is due today. Earlier unpaid rent: ₹1,000. Total due: ₹4,000.',
  ]);
});

test('delete: allowed without tenant history (cascades), refused with any history', async () => {
  const ok = as(ta);
  await ok('DELETE', `/units/${ids.u3}`);
  await ok('DELETE', `/places/${ids.pb}`);
  assert.equal(await prisma.place.count({ where: { id: ids.pb } }), 0);

  await moveIn(ids.u1);
  await ok('DELETE', `/units/${ids.u1}`, undefined, 409);
  await ok('DELETE', `/places/${ids.pa}`, undefined, 409);
  await ok('DELETE', `/categories/${ids.cat}`, undefined, 409);
  await ok('DELETE', `/units/${ids.u2}`); // sibling without history still goes
  await as(tb)('DELETE', `/categories/${ids.cat}`, undefined, 404);

  const empty = await ok('POST', '/categories', { name: 'Parking', placeLabel: 'Plot', unitLabel: 'Vehicle', payerLabel: 'Regular' }, 201);
  const plot = await ok('POST', `/categories/${empty.id}/places`, { name: 'Plot 1' }, 201);
  await ok('POST', `/places/${plot.id}/units`, { name: 'KA-01', defaultAmount: 500 }, 201);
  await ok('DELETE', `/categories/${empty.id}`);
  assert.equal(await prisma.unit.count({ where: { place: { categoryId: empty.id } } }), 0);
});

test('search: tenants by name, phone or unit; borrowers; owner-scoped; needs 2 characters', async () => {
  const ok = as(ta);
  const ag = await moveIn(ids.u1);
  await ok('POST', '/borrowers', { name: 'Ramesh Kumar', phone: '9988776655' }, 201);
  const find = async (q, token = ta) => as(token)('GET', `/search?q=${encodeURIComponent(q)}`);
  assert.deepEqual((await find('rav')).tenants.map((t) => [t.agreementId, t.unit, t.category, t.status]),
    [[ag.id, 'A-1', 'Commercial Rent', 'ACTIVE']]);
  assert.equal((await find('98400')).tenants.length, 1);
  assert.equal((await find('a-1')).tenants.length, 1);
  assert.deepEqual((await find('ramesh')).borrowers.map((b) => b.name), ['Ramesh Kumar']);
  assert.deepEqual(await find('r'), { tenants: [], borrowers: [] });
  assert.deepEqual(await find('ravi', tb), { tenants: [], borrowers: [] });
});
