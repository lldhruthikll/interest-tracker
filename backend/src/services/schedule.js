// Pure schedule engine: which monthly dues an agreement owes. Amounts in integer paise.
const { periodOf, addMonths, daysInMonth, clampDay } = require('../lib/dates');

const dayOf = (d) => Number(d.slice(8, 10));
const maxStr = (a, b) => (a > b ? a : b); // 'YYYY-MM-DD' compares lexicographically

function buildSchedule(a, untilDate) {
  if (!a.endDate && !untilDate) throw new Error('buildSchedule: endDate or untilDate required');
  const first = periodOf(a.startDate);
  const last = a.endDate ? periodOf(a.endDate) : null;
  const rates = [...a.rates].sort((x, y) => (x.effectiveFrom < y.effectiveFrom ? -1 : 1));
  const out = [];
  for (let p = first; !last || p <= last; p = addMonths(p, 1)) {
    let dueDate = a.timing === 'IN_ARREARS' ? clampDay(addMonths(p, 1), a.dueDay) : clampDay(p, a.dueDay);
    if (p === first && a.timing === 'IN_ADVANCE') dueDate = maxStr(dueDate, a.startDate);
    if (untilDate && dueDate > untilDate) {
      if (!last) break; // unbounded: due dates only increase
      continue;
    }
    const rate = rates.filter((r) => r.effectiveFrom <= p).pop();
    if (!rate) continue;
    const dim = daysInMonth(p);
    const from = p === first ? dayOf(a.startDate) : 1;
    const to = p === last ? dayOf(a.endDate) : dim;
    let amountPaise = rate.amountPaise;
    if (from !== 1 || to !== dim) {
      const rule = p === first ? a.firstMonthRule : a.lastMonthRule;
      if (rule === 'FREE') continue;
      if (rule === 'PRORATED') amountPaise = Math.round((rate.amountPaise * (to - from + 1)) / dim);
    }
    out.push({ period: p, dueDate, amountPaise });
  }
  return out;
}

module.exports = { buildSchedule };
