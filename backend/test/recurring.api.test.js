// Categories → places → units, payers, agreements (move-in, billing, rates), move-out settlement (spec §7).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');
const { resetDb, startServer, api } = require('./helpers');

let srv, ta, ids;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.close(); await prisma.$disconnect(); });

const call = (method, path, body) => api(srv.url, `/api${path}`, { method, token: ta, body });
async function ok(method, path, body, status = 200) {
  const r = await call(method, path, body);
  assert.equal(r.status, status, `${method} ${path} → ${JSON.stringify(r.body)}`);
  return r.body;
}
const status = async (method, path, body) => (await call(method, path, body)).status;
const day = (d) => d.slice(0, 10);
const dues = (ag) => ag.dues.map((d) => [d.period, day(d.dueDate), d.amount, d.paidAmount, d.status]);
const unitStatus = async (unitId) => {
  const cat = await ok('GET', `/categories/${ids.cat}`);
  return cat.places.flatMap((p) => p.units).find((u) => u.id === unitId).status;
};
const moveIn = (unitId, extra) => ok('POST', '/agreements', {
  unitId, newPayer: { name: 'Ravi', phone: '98400' }, startDate: '2026-04-01', dueDay: 5, amount: 3000,
  timing: 'IN_ADVANCE', firstMonthRule: 'PRORATED', lastMonthRule: 'PRORATED', ...extra }, 201);
const pay = (agreementId, amount, paymentDate) =>
  ok('POST', '/recurring-payments', { agreementId, amount, paymentDate, method: 'CASH' }, 201);

test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-06-10';
  const A = await prisma.user.create({ data: { username: 'a', password: 'x', name: 'a', role: 'MEMBER' } });
  ta = jwt.sign({ userId: A.id }, process.env.JWT_SECRET);
  const cat = await ok('POST', '/categories', { name: 'Commercial Rent', placeLabel: 'Building', unitLabel: 'Shop', payerLabel: 'Tenant' }, 201);
  const pa = await ok('POST', `/categories/${cat.id}/places`, { name: 'Building A', address: 'Main Rd' }, 201);
  const pb = await ok('POST', `/categories/${cat.id}/places`, { name: 'Building B' }, 201);
  const u1 = await ok('POST', `/places/${pa.id}/units`, { name: 'A-1', defaultAmount: 31000 }, 201);
  const u2 = await ok('POST', `/places/${pa.id}/units`, { name: 'A-2', defaultAmount: 3000 }, 201);
  const u3 = await ok('POST', `/places/${pb.id}/units`, { name: 'B-1', defaultAmount: 3000, notes: 'corner' }, 201);
  ids = { cat: cat.id, pa: pa.id, pb: pb.id, u1: u1.id, u2: u2.id, u3: u3.id };
});

test('categories, places, units: tree with labels, archive, delete guard, validation', async () => {
  const list = await ok('GET', '/categories');
  assert.deepEqual(list.map((c) => [c.name, c.placeLabel, c.unitLabel, c.payerLabel]), [['Commercial Rent', 'Building', 'Shop', 'Tenant']]);
  const cat = await ok('GET', `/categories/${ids.cat}`);
  assert.deepEqual(cat.places.map((p) => [p.name, p.units.map((u) => [u.name, u.defaultAmount, u.status, u.agreement])]), [
    ['Building A', [['A-1', 31000, 'VACANT', null], ['A-2', 3000, 'VACANT', null]]],
    ['Building B', [['B-1', 3000, 'VACANT', null]]]]);

  assert.equal(await status('DELETE', `/categories/${ids.cat}`), 409); // has places
  await ok('PUT', `/categories/${ids.cat}`, { archived: true });
  assert.deepEqual(await ok('GET', '/categories'), []);
  assert.equal((await ok('GET', '/categories?all=1')).length, 1);

  const parking = await ok('POST', '/categories', { name: 'Parking', placeLabel: 'Lot', unitLabel: 'Vehicle pass', payerLabel: 'Regular', color: '#0a0' }, 201);
  await ok('DELETE', `/categories/${parking.id}`);
  assert.equal(await prisma.category.count(), 1);

  const p = await ok('PUT', `/places/${ids.pb}`, { name: 'Building B2', address: null });
  assert.deepEqual([p.name, p.address], ['Building B2', null]);
  const u = await ok('PUT', `/units/${ids.u3}`, { name: 'B-1a', defaultAmount: '3500.50', archived: true });
  assert.deepEqual([u.name, u.defaultAmount, u.notes, u.archived], ['B-1a', 3500.5, 'corner', true]);

  const bad = [
    ['POST', '/categories', { name: ' ', placeLabel: 'L', unitLabel: 'U', payerLabel: 'P' }],
    ['POST', '/categories', { name: 'X', placeLabel: 'L', unitLabel: 'U' }],
    ['PUT', `/categories/${ids.cat}`, { archived: 'yes' }],
    ['POST', `/categories/${ids.cat}/places`, {}],
    ['POST', `/places/${ids.pa}/units`, { name: 'X', defaultAmount: 0 }],
    ['PUT', `/units/${ids.u1}`, { defaultAmount: 'abc' }],
    ['PUT', `/units/${ids.u1}`, { name: '' }],
    ['GET', '/categories/abc'],
  ];
  for (const [m, path, body] of bad) assert.equal(await status(m, path, body), 400, `${m} ${path} ${JSON.stringify(body)}`);
  assert.equal(await status('GET', '/categories/999'), 404);

  assert.equal(await status('POST', '/agreements', { unitId: ids.u3, newPayer: { name: 'X', phone: '1' }, startDate: '2026-04-01',
    dueDay: 5, amount: 1 }), 400); // archived unit
  await moveIn(ids.u1, { startDate: '2026-07-01' });
  assert.equal(await unitStatus(ids.u1), 'UPCOMING'); // no dues yet
});

test('2-level category: blank top level stored as empty, export works, guarded when switching', async () => {
  const flat = await ok('POST', '/categories', { name: 'Parking', unitLabel: 'Vehicle pass', payerLabel: 'Regular' }, 201);
  assert.equal(flat.placeLabel, '');
  const lot = await ok('POST', `/categories/${flat.id}/places`, { name: 'Parking' }, 201);
  const pass = await ok('POST', `/places/${lot.id}/units`, { name: 'Car #1', defaultAmount: 1500 }, 201);
  await moveIn(pass.id);
  const xlsx = await call('GET', `/categories/${flat.id}/export`);
  assert.equal(xlsx.status, 200);

  // 3 → 2 needs at most one active place; archiving the extra makes it allowed; 2 → 3 just sets a label
  assert.equal(await status('PUT', `/categories/${ids.cat}`, { placeLabel: '' }), 409);
  await ok('PUT', `/places/${ids.pb}`, { archived: true });
  assert.equal((await ok('PUT', `/categories/${ids.cat}`, { placeLabel: ' ' })).placeLabel, '');
  assert.equal((await ok('PUT', `/categories/${flat.id}`, { placeLabel: 'Lot' })).placeLabel, 'Lot');
});

test('preview, move-in with advance, one active agreement per unit, payers and logins', async () => {
  const pv = { startDate: '2026-03-25', dueDay: 5, timing: 'IN_ADVANCE', firstMonthRule: 'PRORATED', amount: 31000 };
  assert.deepEqual(await ok('POST', '/agreements/preview', pv), [
    { period: '2026-03', dueDate: '2026-03-25', amount: 7000 }, { period: '2026-04', dueDate: '2026-04-05', amount: 31000 }]);
  assert.deepEqual(await ok('POST', '/agreements/preview', { ...pv, timing: 'IN_ARREARS' }), [
    { period: '2026-03', dueDate: '2026-04-05', amount: 7000 }, { period: '2026-04', dueDate: '2026-05-05', amount: 31000 }]);
  assert.deepEqual(await ok('POST', '/agreements/preview', { ...pv, firstMonthRule: 'FREE' }), [
    { period: '2026-04', dueDate: '2026-04-05', amount: 31000 }, { period: '2026-05', dueDate: '2026-05-05', amount: 31000 }]);
  assert.equal(await status('POST', '/agreements/preview', { ...pv, dueDay: 0 }), 400);

  const body = { unitId: ids.u1, newPayer: { name: 'Ravi', phone: '98400' }, startDate: '2026-03-25', dueDay: 5, amount: 31000,
    timing: 'IN_ADVANCE', firstMonthRule: 'PRORATED', lastMonthRule: 'PRORATED', advanceAmount: 50000, advanceDate: '2026-03-20' };
  const bad = [{ dueDay: 0 }, { dueDay: 32 }, { dueDay: 1.5 }, { timing: 'LATER' }, { firstMonthRule: 'HALF' }, { lastMonthRule: 'x' },
    { startDate: '2026-02-30' }, { amount: -1 }, { unitId: 'abc' }, { newPayer: undefined }, { newPayer: { name: 'X' } },
    { advanceAmount: 0 }, { advanceDate: '2026-13-01' }];
  for (const b of bad) assert.equal(await status('POST', '/agreements', { ...body, ...b }), 400, JSON.stringify(b));

  const ag = await ok('POST', '/agreements', body, 201);
  assert.equal(ag.balances.advanceHeldPaise, 5000000);
  assert.equal(ag.balances.unpaidPaise, (7000 + 3 * 31000) * 100);
  assert.deepEqual(dues(ag), [
    ['2026-03', '2026-03-25', 7000, 0, 'PENDING'], ['2026-04', '2026-04-05', 31000, 0, 'PENDING'],
    ['2026-05', '2026-05-05', 31000, 0, 'PENDING'], ['2026-06', '2026-06-05', 31000, 0, 'PENDING']]);
  assert.deepEqual(ag.rateChanges.map((r) => [r.effectiveFrom, r.amount]), [['2026-03', 31000]]);
  assert.equal(ag.unit.place.category.unitLabel, 'Shop');
  assert.equal(await unitStatus(ids.u1), 'OVERDUE');

  // second move-in on the same unit → 409, and the new payer it tried to create is rolled back
  assert.equal(await status('POST', '/agreements', body), 409);
  assert.equal(await status('POST', '/agreements', { ...body, newPayer: undefined, payerId: ag.payer.id }), 409);
  assert.equal(await prisma.payer.count(), 1);

  // same payer can take a second unit
  const ag2 = await ok('POST', '/agreements', { ...body, unitId: ids.u2, newPayer: undefined, payerId: ag.payer.id, advanceAmount: undefined }, 201);
  assert.equal(ag2.balances.advanceHeldPaise, 0);

  // additional advance
  const adv = await ok('POST', `/agreements/${ag.id}/advance`, { type: 'RECEIVED', amount: 10000, date: '2026-06-01', notes: 'top-up' }, 201);
  assert.equal(adv.balances.advanceHeldPaise, 6000000);
  assert.equal(await status('POST', `/agreements/${ag.id}/advance`, { type: 'REFUNDED', amount: 1, date: '2026-06-01' }), 400);
  assert.equal(await status('POST', `/agreements/${ag.id}/advance`, { type: 'RECEIVED', amount: 1, date: 'x' }), 400);

  // payers
  const payers = await ok('GET', '/payers?search=rav');
  assert.deepEqual(payers.map((p) => p.name), ['Ravi']);
  assert.deepEqual(await ok('GET', '/payers?search=zzz'), []);
  const other = await ok('POST', '/payers', { name: 'Sita', phone: '1', notes: 'n' }, 201);
  assert.equal(await status('POST', '/payers', { name: 'NoPhone' }), 400);
  assert.equal((await ok('PUT', `/payers/${other.id}`, { phone: '2' })).phone, '2');

  let pd = await ok('GET', `/payers/${ag.payer.id}`);
  assert.deepEqual(pd.agreements.map((a) => [a.unit.name, a.unit.place.category.name, a.balances.advanceHeldPaise]),
    [['A-1', 'Commercial Rent', 6000000], ['A-2', 'Commercial Rent', 0]]);
  assert.equal(pd.login, null);

  // payer login
  assert.equal(await status('POST', `/payers/${ag.payer.id}/login`, { username: 'ravi', password: 'short' }), 400);
  await ok('POST', `/payers/${ag.payer.id}/login`, { username: 'ravi', password: 'secret123' }, 201);
  assert.equal(await status('POST', `/payers/${ag.payer.id}/login`, { username: 'ravi2', password: 'secret123' }), 409); // already has one
  assert.equal(await status('POST', `/payers/${other.id}/login`, { username: 'a', password: 'secret123' }), 409); // username taken
  const u = await prisma.user.findUnique({ where: { username: 'ravi' } });
  assert.deepEqual([u.role, u.payerId, u.mustChangePassword], ['PAYER', ag.payer.id, true]);
  assert.ok(await bcrypt.compare('secret123', u.password));
  assert.match(u.password, /^\$2[aby]\$10\$/);
  pd = await ok('GET', `/payers/${ag.payer.id}`);
  assert.deepEqual(pd.login, { username: 'ravi', active: true });

  await prisma.user.update({ where: { id: u.id }, data: { mustChangePassword: false } });
  await ok('PUT', `/payers/${ag.payer.id}/login`, { password: 'newsecret1', active: false });
  const u2 = await prisma.user.findUnique({ where: { id: u.id } });
  assert.deepEqual([u2.active, u2.mustChangePassword], [false, true]);
  assert.ok(await bcrypt.compare('newsecret1', u2.password));
  assert.equal(await status('PUT', `/payers/${ag.payer.id}/login`, { active: 'no' }), 400);
  assert.equal(await status('PUT', `/payers/${other.id}/login`, { active: false }), 404); // no login yet

  // archiving a unit with an active agreement → 409
  assert.equal(await status('PUT', `/units/${ids.u1}`, { archived: true }), 409);
});

test('billing change recalculates unpaid dues only; rate change; validation', async () => {
  const ag = await moveIn(ids.u1, { startDate: '2026-03-25', amount: 31000 });
  await pay(ag.id, 7000, '2026-03-25');

  // IN_ARREARS + FULL first month: paid March is untouched; unpaid dues move; June (due Jul 5) is not yet due
  const b = await ok('PUT', `/agreements/${ag.id}/billing`, { timing: 'IN_ARREARS', firstMonthRule: 'FULL' });
  assert.deepEqual(dues(b), [
    ['2026-03', '2026-03-25', 7000, 7000, 'PAID'], ['2026-04', '2026-05-05', 31000, 0, 'PENDING'],
    ['2026-05', '2026-06-05', 31000, 0, 'PENDING']]);
  assert.deepEqual([b.timing, b.firstMonthRule, b.dueDay], ['IN_ARREARS', 'FULL', 5]);

  const r = await ok('POST', `/agreements/${ag.id}/rates`, { amount: 35000, effectiveFrom: '2026-05' });
  assert.deepEqual(dues(r).map((d) => d[2]), [7000, 31000, 35000]);
  const r2 = await ok('POST', `/agreements/${ag.id}/rates`, { amount: 36000, effectiveFrom: '2026-05' }); // upsert
  assert.deepEqual(r2.rateChanges.map((x) => [x.effectiveFrom, x.amount]), [['2026-03', 31000], ['2026-05', 36000]]);
  assert.equal(r2.balances.unpaidPaise, (31000 + 36000) * 100);

  // ARREARS (due 25th) → ADVANCE (due 5th): May's new due date (May 5) precedes paid April's (May 25);
  // FIFO is by month, so April stays paid
  const ar = await moveIn(ids.u2, { timing: 'IN_ARREARS', dueDay: 25 });
  await pay(ar.id, 3000, '2026-05-25');
  const ad = await ok('PUT', `/agreements/${ar.id}/billing`, { timing: 'IN_ADVANCE', dueDay: 5 });
  assert.deepEqual(dues(ad), [
    ['2026-04', '2026-05-25', 3000, 3000, 'PAID'], ['2026-05', '2026-05-05', 3000, 0, 'PENDING'],
    ['2026-06', '2026-06-05', 3000, 0, 'PENDING']]);

  const bad = [
    ['PUT', 'billing', { dueDay: 40 }], ['PUT', 'billing', { timing: 'x' }], ['PUT', 'billing', { lastMonthRule: 'HALF' }],
    ['POST', 'rates', { amount: 1, effectiveFrom: '2026-02' }], ['POST', 'rates', { amount: 1, effectiveFrom: '2026-13' }],
    ['POST', 'rates', { amount: 1, effectiveFrom: '2026-5' }], ['POST', 'rates', { amount: 0, effectiveFrom: '2026-06' }],
  ];
  for (const [m, p, body] of bad) assert.equal(await status(m, `/agreements/${ag.id}/${p}`, body), 400, `${p} ${JSON.stringify(body)}`);
});

test('move-out: preview rolls back; settlement applies advance, retains, refunds; unit becomes vacant', async () => {
  const ag = await moveIn(ids.u2, { advanceAmount: 50000 });
  await pay(ag.id, 6000, '2026-05-05'); // April + May paid; June ₹3,000 unpaid
  const mo = { endDate: '2026-06-10', lastMonthRule: 'PRORATED' };

  const pv = await ok('POST', `/agreements/${ag.id}/move-out/preview`, mo);
  assert.deepEqual(pv.dues.map((d) => [d.period, d.amount, d.status]),
    [['2026-04', 3000, 'PAID'], ['2026-05', 3000, 'PAID'], ['2026-06', 1000, 'PENDING']]);
  assert.deepEqual([pv.unpaidPaise, pv.advanceHeldPaise, pv.creditPaise], [100000, 5000000, 0]);
  let g = await ok('GET', `/agreements/${ag.id}`);
  assert.deepEqual([g.status, g.endDate], ['ACTIVE', null]);
  assert.deepEqual(dues(g).map((d) => d[2]), [3000, 3000, 3000]);

  const bad = [{ endDate: '2026-06-11' }, { endDate: '2026-03-31' }, { endDate: '2026-02-30' }, { lastMonthRule: 'HALF' },
    { applyAdvance: 'yes' }, { retained: { amount: 60000, notes: 'too much' } }, { retained: { amount: 0 } }];
  for (const b of bad) {
    assert.equal(await status('POST', `/agreements/${ag.id}/move-out`, { ...mo, applyAdvance: true, retained: null, ...b }), 400, JSON.stringify(b));
  }
  assert.equal(await status('POST', `/agreements/${ag.id}/move-out/preview`, { ...mo, endDate: '2026-06-11' }), 400);
  g = await ok('GET', `/agreements/${ag.id}`);
  assert.deepEqual([g.status, g.advances.length, g.payments.length], ['ACTIVE', 1, 1]); // failed move-outs rolled back

  const out = await ok('POST', `/agreements/${ag.id}/move-out`, { ...mo, applyAdvance: true, retained: { amount: 2000, notes: 'damages' } });
  assert.deepEqual([out.advanceHeldPaise, out.creditPaise, out.unpaidPaise], [0, 0, 0]);

  g = await ok('GET', `/agreements/${ag.id}`);
  assert.deepEqual([g.status, day(g.endDate), g.lastMonthRule], ['ENDED', '2026-06-10', 'PRORATED']);
  assert.deepEqual(dues(g).map((d) => [d[0], d[2], d[4]]), [['2026-04', 3000, 'PAID'], ['2026-05', 3000, 'PAID'], ['2026-06', 1000, 'PAID']]);
  const advPay = g.payments.find((p) => p.method === 'ADVANCE');
  assert.deepEqual([advPay.amount, day(advPay.paymentDate)], [1000, '2026-06-10']);
  assert.deepEqual(g.advances.map((e) => [e.type, e.amount, e.notes, e.paymentId]), [
    ['RECEIVED', 50000, null, null], ['APPLIED_TO_RENT', 1000, null, advPay.id],
    ['RETAINED', 2000, 'damages', null], ['REFUNDED', 47000, null, null]]);
  assert.equal(await unitStatus(ids.u2), 'VACANT');

  // ended agreement is closed for changes; settlement-made ADVANCE payment is not editable
  assert.equal(await status('POST', `/agreements/${ag.id}/move-out`, { ...mo, applyAdvance: false, retained: null }), 409);
  assert.equal(await status('POST', `/agreements/${ag.id}/move-out/preview`, mo), 409);
  assert.equal(await status('PUT', `/agreements/${ag.id}/billing`, { dueDay: 7 }), 409);
  assert.equal(await status('POST', `/agreements/${ag.id}/rates`, { amount: 1, effectiveFrom: '2026-06' }), 409);
  assert.equal(await status('POST', `/agreements/${ag.id}/advance`, { type: 'RECEIVED', amount: 1, date: '2026-06-10' }), 409);
  assert.equal(await status('PUT', `/recurring-payments/${advPay.id}`, { amount: 1 }), 400);
  assert.equal(await status('DELETE', `/recurring-payments/${advPay.id}`), 400);

  // vacant unit can be let again; first due is today
  await moveIn(ids.u2, { startDate: '2026-06-10' });
  assert.equal(await unitStatus(ids.u2), 'DUE_TODAY');
});

test('move-out after full June paid in advance: prorated excess refunded as CREDIT_REFUNDED', async () => {
  const ag = await moveIn(ids.u3, { advanceAmount: 5000 });
  await pay(ag.id, 9000, '2026-06-05'); // April, May, June all paid
  assert.equal(await unitStatus(ids.u3), 'PAID');

  const out = await ok('POST', `/agreements/${ag.id}/move-out`, { endDate: '2026-06-10', lastMonthRule: 'PRORATED', applyAdvance: true, retained: null });
  assert.deepEqual([out.advanceHeldPaise, out.creditPaise, out.unpaidPaise], [0, 0, 0]);
  const g = await ok('GET', `/agreements/${ag.id}`);
  assert.deepEqual(dues(g).map((d) => [d[0], d[2], d[3]]), [['2026-04', 3000, 3000], ['2026-05', 3000, 3000], ['2026-06', 1000, 1000]]);
  assert.deepEqual(g.payments.map((p) => p.method), ['CASH']); // nothing unpaid → no ADVANCE payment
  assert.deepEqual(g.advances.map((e) => [e.type, e.amount]), [['RECEIVED', 5000], ['REFUNDED', 5000], ['CREDIT_REFUNDED', 2000]]);
});

test('settled ledger is closed to payment edits; ENDED agreement takes payments only up to the unpaid amount', async () => {
  const ag = await moveIn(ids.u3, { advanceAmount: 5000 });
  const cash = await pay(ag.id, 3000, '2026-04-05'); // April paid; May ₹3,000 and June unpaid
  await ok('POST', `/agreements/${ag.id}/move-out`, { endDate: '2026-06-10', lastMonthRule: 'PRORATED', applyAdvance: false, retained: null });
  const id = cash.payment.id;
  assert.equal(await status('DELETE', `/recurring-payments/${id}`), 409);
  assert.equal(await status('PUT', `/recurring-payments/${id}`, { amount: 9000 }), 409);

  // unpaid after move-out: May 3,000 + June 1,000 (prorated)
  const post = (amount) => status('POST', '/recurring-payments', { agreementId: ag.id, amount, paymentDate: '2026-06-10', method: 'CASH' });
  assert.equal(await post(4001), 400);
  assert.equal(await post(1000), 201);
  assert.equal(await post(3000), 201);
  assert.equal(await post(1), 400); // fully paid now
  const g = await ok('GET', `/agreements/${ag.id}`);
  assert.deepEqual([g.balances.unpaidPaise, g.balances.creditPaise, g.balances.advanceHeldPaise], [0, 0, 0]);
  assert.equal(g.payments.length, 3);
});
