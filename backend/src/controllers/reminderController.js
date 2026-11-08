// Daily rent reminders over the SMS Push Gateway (my_proj/android_in_app). A scheduler (GitHub Actions,
// .github/workflows/rent-reminders.yml) calls POST /api/jobs/rent-reminders with X-Job-Key = JOB_SECRET.
// Texts every tenant whose rent falls due today (IST) and is not fully paid, for owners who switched it on.
// The SMS id is fixed per due ("rent-<dueId>"), so a second run the same day is ignored by the phone.
const crypto = require('crypto');
const prisma = require('../config/db');
const { HttpError } = require('../lib/errors');
const { forOwner } = require('../lib/ownerDb');
const { todayIST, toDbDate } = require('../lib/dates');
const { toPaise } = require('../lib/money');
const { syncOwner, agreementBalances } = require('../services/recurringSync');
const smsPush = require('../lib/smsPush'); // called as smsPush.sendSms so tests can stub it

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (period) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const inr = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Payer phones are free text. 10 digits (or 0 + 10) get the default country code; +<digits> is kept.
function normalizePhone(raw, cc = process.env.SMS_DEFAULT_COUNTRY_CODE || '91') {
  const d = String(raw || '').replace(/[\s().-]/g, '');
  if (/^\+\d{8,15}$/.test(d)) return d;
  if (/^0\d{10}$/.test(d)) return `+${cc}${d.slice(1)}`;
  if (/^\d{10}$/.test(d)) return `+${cc}${d}`;
  return null;
}

function reminderText({ payerName, unitName, period, duePaise, unpaidPaise }) {
  const base = `Hi ${payerName}, rent of ${inr(duePaise)} for ${unitName} (${monthLabel(period)}) is due today.`;
  return unpaidPaise > duePaise ? `${base} Total unpaid: ${inr(unpaidPaise)}.` : base;
}

function smsConfig() {
  const { SMS_SERVICE_ACCOUNT_JSON, SMS_DEVICE_TOKEN, SMS_SECRET } = process.env;
  if (!SMS_SERVICE_ACCOUNT_JSON || !SMS_DEVICE_TOKEN || !SMS_SECRET) return null;
  return { serviceAccount: JSON.parse(SMS_SERVICE_ACCOUNT_JSON), deviceToken: SMS_DEVICE_TOKEN, secret: SMS_SECRET };
}

function checkJobKey(req) {
  const want = Buffer.from(process.env.JOB_SECRET || '');
  const got = Buffer.from(String(req.get('x-job-key') || ''));
  if (!want.length || want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new HttpError(401, 'Bad job key');
}

// Today's unpaid dues for one owner, with the text to send. Syncs first so today's dues exist.
async function dueToday(ownerId, today) {
  return forOwner(ownerId).$transaction(async (tx) => {
    await syncOwner(tx);
    const dues = await tx.recurringDue.findMany({ where: { dueDate: toDbDate(today), agreement: { status: 'ACTIVE' } },
      include: { agreement: { include: { payer: true, unit: true } } }, orderBy: { id: 'asc' } });
    const out = [];
    for (const d of dues) {
      const duePaise = toPaise(d.amount) - toPaise(d.paidAmount);
      if (duePaise <= 0) continue;
      const { unpaidPaise } = await agreementBalances(tx, d.agreementId);
      const { payer, unit } = d.agreement;
      out.push({ dueId: d.id, agreementId: d.agreementId, phone: payer.phone,
        text: reminderText({ payerName: payer.name, unitName: unit.name, period: d.period, duePaise, unpaidPaise }) });
    }
    return out;
  }, { timeout: 30000 });
}

// Response carries counts and agreement ids only: scheduler logs should not hold tenants' numbers or texts.
async function rentReminders(req, res) {
  checkJobKey(req);
  const cfg = smsConfig();
  if (!cfg) throw new HttpError(503, 'SMS gateway is not configured (SMS_SERVICE_ACCOUNT_JSON, SMS_DEVICE_TOKEN, SMS_SECRET)');
  const today = todayIST();
  const out = { date: today, sent: 0, skipped: [], failed: [] };
  const owners = await prisma.user.findMany({ where: { smsReminders: true, active: true, role: { in: ['ADMIN', 'MEMBER'] } },
    select: { id: true }, orderBy: { id: 'asc' } });
  for (const { id: ownerId } of owners) {
    for (const r of await dueToday(ownerId, today)) {
      const to = normalizePhone(r.phone);
      if (!to) { out.skipped.push({ agreementId: r.agreementId, reason: 'phone number not usable' }); continue; }
      try {
        await smsPush.sendSms({ ...cfg, to, text: r.text, id: `rent-${r.dueId}`, ttlSeconds: 12 * 3600 });
        out.sent += 1;
      } catch (e) {
        out.failed.push({ agreementId: r.agreementId, reason: e.message.slice(0, 200) });
      }
    }
  }
  res.json(out);
}

module.exports = { rentReminders, normalizePhone, reminderText };
