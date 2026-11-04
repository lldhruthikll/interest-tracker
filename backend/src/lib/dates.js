// Calendar dates are 'YYYY-MM-DD' strings; periods are 'YYYY-MM'.
// Business timezone is Asia/Kolkata (UTC+05:30, no DST).
const IST_OFFSET_MS = 330 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

function todayIST(now = new Date()) {
  if (process.env.NODE_ENV === 'test' && process.env.FAKE_TODAY) return process.env.FAKE_TODAY;
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// From a @db.Date value (Prisma returns UTC midnight).
const toDateOnly = (d) => d.toISOString().slice(0, 10);
const toDbDate = (s) => new Date(`${s}T00:00:00Z`);
const periodOf = (d) => d.slice(0, 7);

function addDays(d, n) {
  const t = toDbDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return toDateOnly(t);
}

function addMonths(period, n) {
  const [y, m] = period.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

function daysInMonth(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const clampDay = (period, day) => `${period}-${pad(Math.min(day, daysInMonth(period)))}`;

const isValidDateStr = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toDateOnly(toDbDate(s)) === s;

module.exports = { todayIST, addDays, toDateOnly, toDbDate, periodOf, addMonths, daysInMonth, clampDay, isValidDateStr };
