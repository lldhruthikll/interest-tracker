// Rent reminder job: who gets a text, what it says, job-key auth, the per-owner switch. SMS sending is stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/db');
const smsPush = require('../src/lib/smsPush');
const { normalizePhone } = require('../src/controllers/reminderController');
const { resetDb, startServer, api } = require('./helpers');

let srv, ta, tb, ids, calls;
const realSend = smsPush.sendSms;
test.before(async () => { srv = await startServer(); });
test.after(async () => { smsPush.sendSms = realSend; await srv.close(); await prisma.$disconnect(); });

const as = (token) => async (method, path, body, status = 200) => {
  const r = await api(srv.url, `/api${path}`, { method, token, body });
  assert.equal(r.status, status, `${method} ${path} → ${JSON.stringify(r.body)}`);
  return r.body;
};
const job = async (key = 'job-key', status = 200) => {
  const r = await fetch(`${srv.url}/api/jobs/rent-reminders`, { method: 'POST', headers: key ? { 'X-Job-Key': key } : {} });
  assert.equal(r.status, status);
  return r.json();
};

test.beforeEach(async () => {
  await resetDb();
  process.env.FAKE_TODAY = '2026-11-05';
  Object.assign(process.env, { JOB_SECRET: 'job-key', SMS_DEVICE_TOKEN: 'device', SMS_SECRET: 'secret',
    SMS_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'p', client_email: 'x@p', private_key: 'k' }) });
  calls = [];
  smsPush.sendSms = async (args) => { calls.push(args); return { id: args.id }; };

  const mk = (u) => prisma.user.create({ data: { username: u, password: 'x', name: u, role: 'MEMBER', smsReminders: u === 'a' } });
  const [A, B] = [await mk('a'), await mk('b')];
  [ta, tb] = [A, B].map((u) => jwt.sign({ userId: u.id }, process.env.JWT_SECRET));
  const setup = async (token, tenants) => {
    const ok = as(token);
    const cat = await ok('POST', '/categories', { name: 'Rent', unitLabel: 'Shop', payerLabel: 'Tenant' }, 201);
    const place = await ok('POST', `/categories/${cat.id}/places`, { name: 'Rent' }, 201);
    const out = {};
    for (const [unit, name, phone, dueDay] of tenants) {
      const u = await ok('POST', `/places/${place.id}/units`, { name: unit, defaultAmount: 7500 }, 201);
      out[unit] = (await ok('POST', '/agreements', { unitId: u.id, newPayer: { name, phone }, startDate: '2026-09-01', dueDay,
        amount: 7500, timing: 'IN_ADVANCE', firstMonthRule: 'FULL', lastMonthRule: 'FULL' }, 201)).id;
    }
    return out;
  };
  ids = await setup(ta, [['A-1', 'Ravi', '98400 12345', 5], ['A-2', 'Sita', '+919811122233', 5],
    ['A-3', 'Mani', '12', 5], ['A-4', 'Later', '9876543210', 20]]);
  await setup(tb, [['B-1', 'Other', '9000000000', 5]]); // owner b has reminders off
});

test('texts tenants due today with what they owe; skips paid, later, unusable numbers and owners who opted out', async () => {
  const ok = as(ta);
  // Sita pays November in full; Ravi paid nothing since September (Sep, Oct, Nov unpaid)
  await ok('POST', '/recurring-payments', { agreementId: ids['A-2'], amount: 22500, paymentDate: '2026-11-04', method: 'CASH' }, 201);

  const out = await job();
  assert.equal(out.date, '2026-11-05');
  assert.equal(out.sent, 1);
  assert.deepEqual(out.skipped, [{ agreementId: ids['A-3'], reason: 'phone number not usable' }]);
  assert.deepEqual(out.failed, []);
  assert.equal(calls.length, 1);
  const [c] = calls;
  assert.equal(c.to, '+919840012345');
  assert.equal(c.text, 'Hi Ravi, your Nov 2026 rent of ₹7,500 for A-1 is due today. Earlier unpaid rent: ₹15,000. Total due: ₹22,500.');
  assert.match(c.id, /^rent-\d+$/);
  assert.deepEqual([c.deviceToken, c.secret, c.serviceAccount.project_id], ['device', 'secret', 'p']);

  // same day again: same id, so the phone drops the repeat
  await job();
  assert.equal(calls[1].id, c.id);
  // response holds no phone numbers or texts
  assert.ok(!JSON.stringify(out).includes('9840'));
});

test('lending: borrowers with interest due today get a text with total pending; non-rent categories say "payment"', async () => {
  const ok = as(ta);
  // Ramesh: interest due Oct 5 and Nov 5, nothing paid → ₹2,000 due today, ₹4,000 pending
  const ramesh = await ok('POST', '/borrowers', { name: 'Ramesh', phone: '9988776655' }, 201);
  const loan = await ok('POST', '/loans', { borrowerId: ramesh.id, principal: 100000, monthlyInterest: 2000, startDate: '2026-09-05' }, 201);
  // Suma: only Nov 5 due, already paid → no text
  const suma = await ok('POST', '/borrowers', { name: 'Suma', phone: '9988776600' }, 201);
  await ok('POST', '/loans', { borrowerId: suma.id, principal: 50000, monthlyInterest: 1000, startDate: '2026-10-05' }, 201);
  await ok('POST', '/payments', { borrowerId: suma.id, amount: 1000, paymentDate: '2026-11-04' }, 201);
  // a parking regular due today
  const cat = await ok('POST', '/categories', { name: 'Parking', unitLabel: 'Vehicle pass', payerLabel: 'Regular' }, 201);
  const lot = await ok('POST', `/categories/${cat.id}/places`, { name: 'Parking' }, 201);
  const pass = await ok('POST', `/places/${lot.id}/units`, { name: 'Car #1', defaultAmount: 1500 }, 201);
  await ok('POST', '/agreements', { unitId: pass.id, newPayer: { name: 'Kiran', phone: '9123456780' }, startDate: '2026-11-01', dueDay: 5,
    amount: 1500, timing: 'IN_ADVANCE', firstMonthRule: 'FULL', lastMonthRule: 'FULL' }, 201);

  const out = await job();
  const byText = (name) => calls.find((c) => c.text.startsWith(`Hi ${name},`));
  assert.equal(byText('Ramesh').text, 'Hi Ramesh, your Nov 2026 interest of ₹2,000 is due today. Earlier unpaid interest: ₹2,000. Total due: ₹4,000.');
  assert.equal(byText('Ramesh').to, '+919988776655');
  assert.match(byText('Ramesh').id, /^loan-\d+$/);
  assert.equal(byText('Suma'), undefined);
  assert.equal(byText('Kiran').text, 'Hi Kiran, your Nov 2026 payment of ₹1,500 for Car #1 is due today.');
  assert.equal(byText('Ravi').text.includes('rent of ₹7,500'), true); // "Rent" category keeps "rent"
  assert.equal(out.sent, 4); // Ravi, Sita, Kiran, Ramesh (A-3 skipped, A-4 due later, Suma paid)
  assert.deepEqual(out.failed, []);
  // a lending entry that can't be sent is reported by loan id
  await prisma.borrower.update({ where: { id: ramesh.id }, data: { phone: '1' } });
  const again = await job();
  assert.ok(again.skipped.some((s) => s.loanId === loan.id && s.reason === 'phone number not usable'));
});

test('job key required; 503 when the gateway is not configured; a send error is reported, not thrown', async () => {
  await job(null, 401);
  await job('wrong-key!', 401);
  delete process.env.SMS_DEVICE_TOKEN;
  await job('job-key', 503);
  process.env.SMS_DEVICE_TOKEN = 'device';
  smsPush.sendSms = async () => { throw new Error('FCM send failed: 404'); };
  const out = await job();
  assert.equal(out.sent, 0);
  assert.equal(out.failed.length, 2); // Ravi and Sita (unpaid this time)
});

test('per-owner switch via /me/preferences and profile', async () => {
  assert.equal((await as(tb)('GET', '/auth/profile')).smsReminders, false);
  assert.deepEqual(await as(tb)('PUT', '/me/preferences', { smsReminders: true }), { smsReminders: true });
  await as(tb)('PUT', '/me/preferences', { smsReminders: 'yes' }, 400);
  const out = await job();
  assert.equal(calls.filter((c) => c.text.includes('Other')).length, 1);
  assert.equal(out.sent, 3); // Ravi, Sita, Other
});

test('phone normalisation', () => {
  assert.equal(normalizePhone('98400 12345'), '+919840012345');
  assert.equal(normalizePhone('098400-12345'), '+919840012345');
  assert.equal(normalizePhone('+1 (555) 521-5554'), '+15555215554');
  assert.equal(normalizePhone('12'), null);
  assert.equal(normalizePhone(null), null);
});
