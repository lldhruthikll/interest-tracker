// Overview, category dashboard, calendar, exports (spec §7 received = payment date; advances never count).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
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
const A = (...x) => as(ta)(...x);
const B = (...x) => as(tb)(...x);
const raw = async (path, token) => {
  const res = await fetch(`${srv.url}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, type: res.headers.get('content-type'), buf: Buffer.from(await res.arrayBuffer()) };
};
const moveIn = { startDate: '2026-10-01', dueDay: 5, timing: 'IN_ADVANCE', firstMonthRule: 'FULL', lastMonthRule: 'FULL' };

test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-11-04';
  const mk = (username) => prisma.user.create({ data: { username, password: 'x', name: username, role: 'MEMBER' } });
  [ta, tb] = [await mk('a'), await mk('b')].map((u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET));
  // lending: ₹2,000/month, start 2026-09-05 → due 10-05 (past), 11-05 (upcoming); pays ₹2,000 on 11-03
  const bor = await A('POST', '/borrowers', { name: 'Lender-Borrower-A', phone: '1' }, 201);
  await A('POST', '/loans', { borrowerId: bor.id, principal: 10000, monthlyInterest: 2000, startDate: '2026-09-05' }, 201);
  await A('POST', '/payments', { borrowerId: bor.id, amount: 2000, paymentDate: '2026-11-03' }, 201);
  // rent: two places, A-1 pays ₹7,000 on 11-04; B-1 (₹3,000 + ₹50,000 advance) pays nothing
  const cat = await A('POST', '/categories', { name: 'Rent', placeLabel: 'Building', unitLabel: 'Shop', payerLabel: 'Tenant' }, 201);
  const pa = await A('POST', `/categories/${cat.id}/places`, { name: 'Building A' }, 201);
  const pb = await A('POST', `/categories/${cat.id}/places`, { name: 'Building B' }, 201);
  const u1 = await A('POST', `/places/${pa.id}/units`, { name: 'A-1', defaultAmount: 7000 }, 201);
  const u2 = await A('POST', `/places/${pb.id}/units`, { name: 'B-1', defaultAmount: 3000 }, 201);
  await A('POST', `/places/${pb.id}/units`, { name: 'B-2', defaultAmount: 3000 }, 201);
  const g1 = await A('POST', '/agreements', { ...moveIn, unitId: u1.id, amount: 7000, newPayer: { name: 'Ravi', phone: '9' } }, 201);
  const g2 = await A('POST', '/agreements', { ...moveIn, unitId: u2.id, amount: 3000, advanceAmount: 50000, newPayer: { name: 'Sita', phone: '8' } }, 201);
  await A('POST', '/recurring-payments', { agreementId: g1.id, amount: 7000, paymentDate: '2026-11-04', method: 'CASH' }, 201);
  ids = { bor: bor.id, cat: cat.id, pa: pa.id, pb: pb.id, g1: g1.id, g2: g2.id };
});

test('overview: received by payment date, deposits excluded, pending/overdue, owedBack, trend, upcoming, overdueList', async () => {
  const o = await A('GET', '/overview');
  const key = `category:${ids.cat}`;
  assert.equal(o.month, '2026-11');
  assert.deepEqual(o.ledgers, [
    { key: 'lending', name: 'Lending', received: 2000, advanceRetained: 0, pending: 0, overdue: 0 },
    { key, name: 'Rent', received: 7000, advanceRetained: 0, pending: 3000, overdue: 3000 }]);
  assert.deepEqual(o.totals, { received: 9000, advanceRetained: 0, pending: 3000, overdue: 3000 });
  assert.deepEqual(o.owedBack, { advances: 50000, credit: 0 });
  assert.equal(o.trend.length, 12);
  assert.deepEqual([o.trend[0].period, o.trend[11].period], ['2025-12', '2026-11']);
  assert.deepEqual(o.trend[11].byLedger, { lending: 2000, [key]: 7000 });
  assert.deepEqual(o.trend[10].byLedger, { lending: 0, [key]: 0 });
  assert.deepEqual(o.upcoming.map((i) => [i.ledgerKey, i.date, i.amount]).sort((x, y) => x[2] - y[2]),
    [['lending', '2026-11-05', 2000], [key, '2026-11-05', 3000], [key, '2026-11-05', 7000]]);
  assert.deepEqual(Object.keys(o.upcoming[0]).sort(), ['amount', 'date', 'ledgerKey', 'ledgerName', 'link', 'title']);
  assert.deepEqual(o.overdueList.map((i) => [i.ledgerKey, i.date, i.amount, i.link]), [[key, '2026-10-05', 3000, `/agreements/${ids.g2}`]]);

  const oct = await A('GET', '/overview?month=2026-10&months=3');
  assert.equal(oct.totals.received, 0);
  assert.deepEqual(oct.trend.map((t) => t.period), ['2026-08', '2026-09', '2026-10']);
  for (const q of ['month=2026-13', 'month=x', 'months=0', 'months=25']) await A('GET', `/overview?${q}`, undefined, 400);
});

test('move-out: applied advance counts as received on settlement date; retained is shown apart, never as received', async () => {
  // Nov due (end 11-04, prorated 4/30 of 3000) = 400; unpaid 3000 + 400 = 3400 applied, 2000 retained, rest refunded
  await A('POST', `/agreements/${ids.g2}/move-out`, { endDate: '2026-11-04', lastMonthRule: 'PRORATED', applyAdvance: true,
    retained: { amount: 2000, notes: 'damages' } });
  const key = `category:${ids.cat}`;
  const o = await A('GET', '/overview');
  assert.deepEqual(o.ledgers.map((l) => [l.key, l.received, l.advanceRetained, l.pending]), [['lending', 2000, 0, 0], [key, 10400, 2000, 0]]);
  assert.deepEqual(o.totals, { received: 12400, advanceRetained: 2000, pending: 0, overdue: 0 });
  assert.deepEqual(o.owedBack, { advances: 0, credit: 0 }); // was 50000
  assert.equal(o.trend[11].byLedger[key], 10400);
  const d = await A('GET', `/categories/${ids.cat}/dashboard`);
  assert.deepEqual([d.stats.collectedThisMonth, d.stats.advanceRetained, d.stats.advancesHeld], [10400, 2000, 0]);
  const oct = await A('GET', '/overview?month=2026-10');
  assert.deepEqual([oct.totals.received, oct.totals.advanceRetained], [0, 0]);
});

test('archived categories drop out of the overview; archive is refused while agreements are active', async () => {
  assert.deepEqual(await A('PUT', `/categories/${ids.cat}`, { archived: true }, 409),
    { error: 'Category has active agreements; move them out first' });
  assert.deepEqual(await A('PUT', `/places/${ids.pb}`, { archived: true }, 409),
    { error: 'Place has active agreements; move them out first' });
  await A('PUT', `/categories/${ids.cat}`, { name: 'Rent 2' }); // non-archive edits still fine
  for (const g of [ids.g1, ids.g2]) {
    await A('POST', `/agreements/${g}/move-out`, { endDate: '2026-11-04', applyAdvance: false, retained: null });
  }
  await A('PUT', `/places/${ids.pb}`, { archived: true });
  await A('PUT', `/categories/${ids.cat}`, { archived: true });
  const o = await A('GET', '/overview');
  assert.deepEqual(o.ledgers.map((l) => l.key), ['lending']);
  assert.deepEqual(o.owedBack, { advances: 0, credit: 0 });
});

test('ENDED agreement: payment dated after the end (not future, capped at unpaid) counts in its own month', async () => {
  // B-1 moves out 10-28 owing October's ₹3,000; pays a week later, dated that day
  await A('POST', `/agreements/${ids.g2}/move-out`, { endDate: '2026-10-28', lastMonthRule: 'FULL', applyAdvance: false, retained: null });
  await A('POST', '/recurring-payments', { agreementId: ids.g2, amount: 3000, paymentDate: '2026-11-05', method: 'CASH' }, 400); // future
  await A('POST', '/recurring-payments', { agreementId: ids.g2, amount: 3001, paymentDate: '2026-11-04', method: 'CASH' }, 400); // > unpaid
  await A('POST', '/recurring-payments', { agreementId: ids.g2, amount: 3000, paymentDate: '2026-11-04', method: 'CASH' }, 201);
  const key = `category:${ids.cat}`;
  const o = await A('GET', '/overview');
  assert.deepEqual(o.ledgers.find((l) => l.key === key).received, 10000);
  assert.equal((await A('GET', '/overview?month=2026-10')).ledgers.find((l) => l.key === key).received, 0);
  assert.equal((await A('GET', `/categories/${ids.cat}/dashboard`)).stats.collectedThisMonth, 10000);
  assert.equal((await A('GET', `/agreements/${ids.g2}`)).balances.unpaidPaise, 0);
});

test('agreement detail lists the other agreements on the unit, newest first', async () => {
  await A('POST', `/agreements/${ids.g2}/move-out`, { endDate: '2026-10-20', applyAdvance: false, retained: null });
  const g = await A('GET', `/agreements/${ids.g2}`);
  const unitId = g.unitId;
  const g3 = await A('POST', '/agreements', { ...moveIn, startDate: '2026-10-21', unitId, amount: 3000, newPayer: { name: 'Gita', phone: '7' } }, 201);
  await A('POST', `/agreements/${g3.id}/move-out`, { endDate: '2026-10-31', applyAdvance: false, retained: null });
  const g4 = await A('POST', '/agreements', { ...moveIn, startDate: '2026-11-01', unitId, amount: 3000, newPayer: { name: 'Hari', phone: '6' } }, 201);
  const d = await A('GET', `/agreements/${g4.id}`);
  const day = (x) => x && x.slice(0, 10);
  assert.deepEqual(d.pastAgreements.map((p) => [p.id, p.payer.name, day(p.startDate), day(p.endDate), p.status]), [
    [g3.id, 'Gita', '2026-10-21', '2026-10-31', 'ENDED'], [ids.g2, 'Sita', '2026-10-01', '2026-10-20', 'ENDED']]);
  assert.deepEqual(Object.keys(d.pastAgreements[0]).sort(), ['endDate', 'id', 'payer', 'startDate', 'status']);
  assert.deepEqual(Object.keys(d.pastAgreements[0].payer).sort(), ['id', 'name']);
  assert.deepEqual((await A('GET', `/agreements/${ids.g2}`)).pastAgreements.map((p) => [p.id, p.status]),
    [[g4.id, 'ACTIVE'], [g3.id, 'ENDED']]);
  assert.deepEqual((await A('GET', `/agreements/${ids.g1}`)).pastAgreements, []);
});

test('B sees nothing of A in overview, dashboard, calendar, export', async () => {
  const o = await B('GET', '/overview');
  assert.deepEqual(o.ledgers.map((l) => [l.key, l.received]), [['lending', 0]]);
  assert.equal(o.totals.received, 0);
  assert.deepEqual(o.upcoming.concat(o.overdueList), []);
  assert.deepEqual(await B('GET', '/calendar?from=2026-10-01&to=2026-11-30'), []);
  await B('GET', `/categories/${ids.cat}/dashboard`, undefined, 404);
  assert.equal((await raw(`/categories/${ids.cat}/export`, tb)).status, 404);
});

test('category dashboard: stats, units, placeId filter', async () => {
  const d = await A('GET', `/categories/${ids.cat}/dashboard`);
  assert.deepEqual(d.stats, { dueThisMonth: 10000, collectedThisMonth: 7000, advanceRetained: 0, pending: 3000, overdue: 3000,
    advancesHeld: 50000, credit: 0, occupied: 2, totalUnits: 3 });
  assert.deepEqual(d.places.map((p) => p.name), ['Building A', 'Building B']);
  assert.equal(d.category.name, 'Rent');
  assert.deepEqual(d.units.map((u) => [u.unitName, u.placeName, u.payer?.name ?? null, u.amount, u.status]), [
    ['A-1', 'Building A', 'Ravi', 7000, 'PAID'],
    ['B-1', 'Building B', 'Sita', 3000, 'OVERDUE'],
    ['B-2', 'Building B', null, 3000, 'VACANT']]);

  const f = await A('GET', `/categories/${ids.cat}/dashboard?placeId=${ids.pa}`);
  assert.deepEqual(f.units.map((u) => u.unitName), ['A-1']);
  assert.deepEqual([f.stats.totalUnits, f.stats.occupied, f.stats.collectedThisMonth, f.stats.advancesHeld, f.stats.overdue], [1, 1, 7000, 0, 0]);
  assert.equal(f.places.length, 2);
  await A('GET', `/categories/${ids.cat}/dashboard?placeId=99999`, undefined, 404);
  await A('GET', `/categories/${ids.cat}/dashboard?placeId=abc`, undefined, 400);
  await A('GET', `/categories/${ids.cat}/dashboard?month=2026-1`, undefined, 400);
  const oct = await A('GET', `/categories/${ids.cat}/dashboard?month=2026-10`);
  assert.deepEqual([oct.stats.dueThisMonth, oct.stats.collectedThisMonth], [10000, 0]);
});

test('calendar: lending, persisted and scheduled recurring dues; ledger filter; validation', async () => {
  const key = `category:${ids.cat}`;
  const c = await A('GET', '/calendar?from=2026-10-01&to=2026-11-30');
  const row = (r) => [r.date, r.ledgerKey, r.amount, r.paid, r.status];
  assert.deepEqual(c.map(row).sort(), [
    ['2026-10-05', 'lending', 2000, 2000, 'PAID'],
    ['2026-10-05', key, 3000, 0, 'PENDING'], ['2026-10-05', key, 7000, 7000, 'PAID'],
    ['2026-11-05', 'lending', 2000, 0, 'SCHEDULED'],
    ['2026-11-05', key, 3000, 0, 'SCHEDULED'], ['2026-11-05', key, 7000, 0, 'SCHEDULED']].sort());
  assert.deepEqual(Object.keys(c[0]).sort(), ['amount', 'date', 'ledgerKey', 'ledgerName', 'link', 'paid', 'status', 'title']);
  const lend = await A('GET', '/calendar?from=2026-10-01&to=2026-11-30&ledger=lending');
  assert.ok(lend.length === 2 && lend.every((r) => r.ledgerKey === 'lending' && r.link === `/lending/borrowers/${ids.bor}`));
  assert.equal((await A('GET', `/calendar?from=2026-10-01&to=2026-11-30&ledger=${key}`)).length, 4);
  for (const q of ['', 'from=2026-10-01', 'from=2026-13-01&to=2026-12-01', 'from=2026-11-30&to=2026-11-01',
    'from=2026-10-01&to=2026-11-30&ledger=bogus', 'from=2020-01-01&to=2026-11-30']) await A('GET', `/calendar?${q}`, undefined, 400);
});

test('category export: Dues, Payments, Advances sheets', async () => {
  const r = await raw(`/categories/${ids.cat}/export`, ta);
  assert.equal(r.status, 200);
  assert.match(r.type, /spreadsheetml/);
  const wb = XLSX.read(r.buf);
  assert.deepEqual(wb.SheetNames, ['Dues', 'Payments', 'Advances']);
  const sheet = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n]);
  assert.equal(sheet('Dues').length, 2);
  assert.deepEqual(sheet('Payments').map((p) => [p.Tenant, p.Amount]), [['Ravi', 7000]]);
  assert.deepEqual(sheet('Advances').map((p) => [p.Tenant, p.Type, p.Amount]), [['Sita', 'RECEIVED', 50000]]);
});

test("carried: B's lending excel and payments list contain none of A's data", async () => {
  await B('POST', '/borrowers', { name: 'Own-B', phone: '2' }, 201);
  const r = await raw('/reports/excel', tb);
  assert.equal(r.status, 200);
  const wb = XLSX.read(r.buf);
  const text = JSON.stringify(wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n])));
  assert.ok(!text.includes('Lender-Borrower-A'));
  assert.deepEqual(await B('GET', `/payments?borrowerId=${ids.bor}`), []);
  const a = XLSX.read((await raw('/reports/excel', ta)).buf);
  assert.ok(JSON.stringify(XLSX.utils.sheet_to_json(a.Sheets['Payment History'])).includes('Lender-Borrower-A'));
});
