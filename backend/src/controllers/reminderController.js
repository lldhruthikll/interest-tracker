// Daily due-date reminders over the SMS Push Gateway (my_proj/android_in_app). A scheduler (GitHub Actions,
// .github/workflows/rent-reminders.yml) calls POST /api/jobs/rent-reminders with X-Job-Key = JOB_SECRET.
// For owners who switched it on, texts every tenant/regular (any category) and every borrower (lending)
// whose due falls today (IST) and is not fully paid. The SMS id is fixed per due ("rent-<dueId>",
// "loan-<interestRecordId>"), so a second run the same day is ignored by the phone.
const crypto = require('crypto');
const prisma = require('../config/db');
const { HttpError } = require('../lib/errors');
const { forOwner } = require('../lib/ownerDb');
const { todayIST, toDbDate, toDateOnly } = require('../lib/dates');
const { toPaise } = require('../lib/money');
const { syncOwner, agreementBalances } = require('../services/recurringSync');
const { syncAllActiveLoans } = require('../services/interestService');
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

// "rent" for rent categories, "payment" for the rest (parking passes etc.).
// ponytail: judged from the category name; add a per-category word if a name misleads it.
const dueWord = (categoryName) => (/rent/i.test(categoryName) ? 'rent' : 'payment');

// Spelled out so the reader can check the sum: this month, earlier unpaid, total. The last two only when
// something earlier is unpaid. totalPaise includes today's due.
function withEarlier(base, earlierLabel, duePaise, totalPaise) {
  const earlier = totalPaise - duePaise;
  return earlier > 0 ? `${base} Earlier unpaid ${earlierLabel}: ${inr(earlier)}. Total due: ${inr(totalPaise)}.` : base;
}

function reminderText({ payerName, unitName, categoryName, period, duePaise, unpaidPaise }) {
  const word = dueWord(categoryName);
  const base = `Hi ${payerName}, your ${monthLabel(period)} ${word} of ${inr(duePaise)} for ${unitName} is due today.`;
  return withEarlier(base, word === 'rent' ? 'rent' : 'payments', duePaise, unpaidPaise);
}

function lendingText({ borrowerName, period, duePaise, pendingPaise }) {
  const base = `Hi ${borrowerName}, your ${monthLabel(period)} interest of ${inr(duePaise)} is due today.`;
  return withEarlier(base, 'interest', duePaise, pendingPaise);
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

// Today's unpaid dues for one owner (rent categories and lending), each with its SMS id, phone and text.
// Syncs first so today's dues exist.
async function dueToday(ownerId, today) {
  return forOwner(ownerId).$transaction(async (tx) => {
    await syncOwner(tx);
    await syncAllActiveLoans(tx);
    const out = [];
    const dues = await tx.recurringDue.findMany({ where: { dueDate: toDbDate(today), agreement: { status: 'ACTIVE' } },
      include: { agreement: { include: { payer: true, unit: { include: { place: { include: { category: true } } } } } } },
      orderBy: { id: 'asc' } });
    for (const d of dues) {
      const duePaise = toPaise(d.amount) - toPaise(d.paidAmount);
      if (duePaise <= 0) continue;
      const { unpaidPaise } = await agreementBalances(tx, d.agreementId);
      const { payer, unit } = d.agreement;
      if (!payer.smsReminders) { out.push({ ref: { agreementId: d.agreementId }, off: true }); continue; }
      out.push({ id: `rent-${d.id}`, ref: { agreementId: d.agreementId }, phone: payer.phone,
        text: reminderText({ payerName: payer.name, unitName: unit.name, categoryName: unit.place.category.name,
          period: d.period, duePaise, unpaidPaise }) });
    }
    const records = await tx.interestRecord.findMany({ where: { dueDate: toDbDate(today), loan: { status: 'ACTIVE' } },
      include: { loan: { include: { borrower: true } } }, orderBy: { id: 'asc' } });
    for (const r of records) {
      const duePaise = toPaise(r.amount) - toPaise(r.paidAmount);
      if (duePaise <= 0) continue;
      // everything this borrower owes up to today, across their active loans
      const owed = await tx.interestRecord.findMany({ where: { dueDate: { lte: toDbDate(today) },
        loan: { status: 'ACTIVE', borrowerId: r.loan.borrowerId } }, select: { amount: true, paidAmount: true } });
      if (!r.loan.borrower.smsReminders) { out.push({ ref: { loanId: r.loanId }, off: true }); continue; }
      const pendingPaise = owed.reduce((sum, o) => sum + toPaise(o.amount) - toPaise(o.paidAmount), 0);
      out.push({ id: `loan-${r.id}`, ref: { loanId: r.loanId }, phone: r.loan.borrower.phone,
        text: lendingText({ borrowerName: r.loan.borrower.name, period: toDateOnly(r.dueDate).slice(0, 7), duePaise, pendingPaise }) });
    }
    return out;
  }, { timeout: 30000 });
}

// Response carries counts and agreement/loan ids only: scheduler logs should not hold phone numbers or texts.
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
      if (r.off) { out.skipped.push({ ...r.ref, reason: 'reminders turned off for this person' }); continue; }
      const to = normalizePhone(r.phone);
      if (!to) { out.skipped.push({ ...r.ref, reason: 'phone number not usable' }); continue; }
      try {
        await smsPush.sendSms({ ...cfg, to, text: r.text, id: r.id, ttlSeconds: 12 * 3600 });
        out.sent += 1;
      } catch (e) {
        out.failed.push({ ...r.ref, reason: e.message.slice(0, 200) });
      }
    }
  }
  res.json(out);
}

module.exports = { rentReminders, normalizePhone, reminderText, lendingText };
