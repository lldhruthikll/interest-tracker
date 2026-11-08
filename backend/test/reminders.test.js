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
  assert.equal(c.text, 'Hi Ravi, rent of ₹7,500 for A-1 (Nov 2026) is due today. Total unpaid: ₹22,500.');
  assert.match(c.id, /^rent-\d+$/);
  assert.deepEqual([c.deviceToken, c.secret, c.serviceAccount.project_id], ['device', 'secret', 'p']);

  // same day again: same id, so the phone drops the repeat
  await job();
  assert.equal(calls[1].id, c.id);
  // response holds no phone numbers or texts
  assert.ok(!JSON.stringify(out).includes('9840'));
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
