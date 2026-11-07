// Read side across ledgers: combined Overview and calendar. Ledger keys: 'lending', 'category:<id>'.
// Received = allocations dated by payment date (IST month). A deposit never counts; advance applied to rent does (spec §7).
// Retained advance is reported apart as advanceRetained, never in received.
const { toPaise } = require('../lib/money');
const { ValidationError } = require('../lib/errors');
const { todayIST, istDate, addDays, addMonths, toDateOnly, toDbDate, periodOf, isValidDateStr } = require('../lib/dates');
const { buildSchedule } = require('../services/schedule');
const { getDueDatesForLoan, syncAllActiveLoans } = require('../services/interestService');
const { scheduleInput, syncOwner, agreementBalances } = require('../services/recurringSync');
const { debtSummary } = require('./debtController');

const istPeriod = (ts) => istDate(ts).slice(0, 7);
const rupees = (paise) => paise / 100;
const LENDING = { key: 'lending', name: 'Lending' };
const catKey = (id) => `category:${id}`;

function monthParam(v) {
  if (v === undefined) return periodOf(todayIST());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v))) throw new ValidationError('month must be YYYY-MM');
  return v;
}

// Every due on or between from..to ('YYYY-MM-DD') as {date, ledgerKey, ledgerName, title, amountPaise, paidPaise, status, link}:
// persisted lending records / recurring dues, plus not-yet-persisted ones from the schedules (SCHEDULED).
// activeOnly drops closed loans' records (money-owed views); calendar keeps them.
async function dueItems(tx, cats, from, to, { activeOnly = false } = {}) {
  const items = [];
  const range = { gte: toDbDate(from), lte: toDbDate(to) };
  const records = await tx.interestRecord.findMany({
    where: { dueDate: range, ...(activeOnly && { loan: { status: 'ACTIVE' } }) },
    include: { loan: { include: { borrower: true } } } });
  const seen = new Set(records.map((r) => `${r.loanId}|${toDateOnly(r.dueDate)}`));
  const lend = (date, loan, title, amountPaise, paidPaise, status) => items.push({ date, ledgerKey: LENDING.key,
    ledgerName: LENDING.name, title: `${loan.borrower.name} - ${title}`, amountPaise, paidPaise, status,
    link: `/lending/borrowers/${loan.borrowerId}` });
  for (const r of records) lend(toDateOnly(r.dueDate), r.loan, r.periodName, toPaise(r.amount), toPaise(r.paidAmount), r.status);
  for (const loan of await tx.loan.findMany({ where: { status: 'ACTIVE' }, include: { borrower: true } })) {
    for (const date of getDueDatesForLoan(toDateOnly(loan.startDate), to)) {
      if (date >= from && !seen.has(`${loan.id}|${date}`)) lend(date, loan, date.slice(0, 7), toPaise(loan.monthlyInterest), 0, 'SCHEDULED');
    }
  }

  const inCats = { unit: { place: { categoryId: { in: cats.map((c) => c.id) } } } };
  const name = new Map(cats.map((c) => [c.id, c.name]));
  const rec = (date, a, amountPaise, paidPaise, status) => {
    const id = a.unit.place.categoryId;
    items.push({ date, ledgerKey: catKey(id), ledgerName: name.get(id), title: `${a.unit.name} - ${a.payer.name}`,
      amountPaise, paidPaise, status, link: `/agreements/${a.id}` });
  };
  const ag = { include: { unit: { include: { place: true } }, payer: true } };
  for (const d of await tx.recurringDue.findMany({ where: { dueDate: range, agreement: inCats }, include: { agreement: ag } })) {
    rec(toDateOnly(d.dueDate), d.agreement, toPaise(d.amount), toPaise(d.paidAmount), d.status);
  }
  const active = await tx.agreement.findMany({ where: { status: 'ACTIVE', ...inCats },
    include: { ...ag.include, rateChanges: true, dues: { select: { period: true } } } });
  for (const a of active) {
    const have = new Set(a.dues.map((d) => d.period));
    for (const s of buildSchedule(scheduleInput(a), to)) {
      if (s.dueDate >= from && !have.has(s.period)) rec(s.dueDate, a, s.amountPaise, 0, 'SCHEDULED');
    }
  }
  return items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

const unpaid = (i) => i.amountPaise - i.paidPaise;
const listItem = (i, amountPaise) => ({ ledgerKey: i.ledgerKey, ledgerName: i.ledgerName, title: i.title,
  date: i.date, amount: rupees(amountPaise), link: i.link });

async function getOverview(req, res) {
  const month = monthParam(req.query.month);
  const n = req.query.months === undefined ? 12 : Number(req.query.months);
  if (!Number.isInteger(n) || n < 1 || n > 24) throw new ValidationError('months must be a whole number from 1 to 24');
  const today = todayIST();
  const periods = Array.from({ length: n }, (_, i) => addMonths(month, i - n + 1));

  const out = await req.db.$transaction(async (tx) => {
    await syncAllActiveLoans(tx);
    await syncOwner(tx);
    const cats = await tx.category.findMany({ where: { archived: false }, orderBy: { id: 'asc' } });
    const ledgers = [LENDING, ...cats.map((c) => ({ key: catKey(c.id), name: c.name }))];

    // received[key][period] in paise. ponytail: fetches every allocation in the window; SQL GROUP BY if it gets slow.
    const received = Object.fromEntries(ledgers.map((l) => [l.key, Object.fromEntries(periods.map((p) => [p, 0]))]));
    const add = (key, period, amount) => { if (received[key]?.[period] !== undefined) received[key][period] += toPaise(amount); };
    const lendingAllocs = await tx.paymentAllocation.findMany({
      where: { payment: { paymentDate: { gte: new Date(`${periods[0]}-01T00:00:00+05:30`), lt: new Date(`${addMonths(month, 1)}-01T00:00:00+05:30`) } } },
      select: { amount: true, payment: { select: { paymentDate: true } } } });
    for (const a of lendingAllocs) add(LENDING.key, istPeriod(a.payment.paymentDate), a.amount);
    const recAllocs = await tx.recurringAllocation.findMany({
      where: { payment: { paymentDate: { gte: toDbDate(`${periods[0]}-01`), lt: toDbDate(`${addMonths(month, 1)}-01`) } } },
      select: { amount: true, payment: { select: { paymentDate: true } },
        due: { select: { agreement: { select: { unit: { select: { place: { select: { categoryId: true } } } } } } } } } });
    for (const a of recAllocs) add(catKey(a.due.agreement.unit.place.categoryId), toDateOnly(a.payment.paymentDate).slice(0, 7), a.amount);

    const retained = Object.fromEntries(ledgers.map((l) => [l.key, 0]));
    const kept = await tx.advanceEntry.findMany({ where: { type: 'RETAINED',
      date: { gte: toDbDate(`${month}-01`), lt: toDbDate(`${addMonths(month, 1)}-01`) } },
      select: { amount: true, agreement: { select: { unit: { select: { place: { select: { categoryId: true } } } } } } } });
    for (const e of kept) if (retained[catKey(e.agreement.unit.place.categoryId)] !== undefined) retained[catKey(e.agreement.unit.place.categoryId)] += toPaise(e.amount);

    const owed = await dueItems(tx, cats, '1970-01-01', today, { activeOnly: true });
    const sumOf = (key, f) => owed.filter((i) => i.ledgerKey === key && unpaid(i) > 0 && f(i)).reduce((s, i) => s + unpaid(i), 0);
    const rows = ledgers.map((l) => ({ ...l, received: received[l.key][month], advanceRetained: retained[l.key], pending: sumOf(l.key, (i) => i.date <= today),
      overdue: sumOf(l.key, (i) => i.date < today) }));

    let advances = 0; let credit = 0;
    for (const a of await tx.agreement.findMany({ where: { unit: { place: { categoryId: { in: cats.map((c) => c.id) } } } }, orderBy: { id: 'asc' } })) {
      const b = await agreementBalances(tx, a.id);
      advances += b.advanceHeldPaise; credit += b.creditPaise;
    }
    const soon = (await dueItems(tx, cats, addDays(today, 1), addDays(today, 7), { activeOnly: true })).filter((i) => unpaid(i) > 0);
    const lent = await tx.loan.aggregate({ where: { status: 'ACTIVE' }, _sum: { principal: true } });
    const debts = await debtSummary(tx, month);
    return { rows, advances, credit, received, ledgers, soon, owed, lentOutPaise: toPaise(lent._sum.principal ?? 0), debts };
  }, { timeout: 30000 });

  const sum = (f) => out.rows.reduce((s, l) => s + f(l), 0);
  const { totals: d, creditors } = out.debts;
  res.json({
    month,
    ledgers: out.rows.map((l) => ({ key: l.key, name: l.name, received: rupees(l.received), advanceRetained: rupees(l.advanceRetained), pending: rupees(l.pending), overdue: rupees(l.overdue) })),
    totals: { received: rupees(sum((l) => l.received)), advanceRetained: rupees(sum((l) => l.advanceRetained)), pending: rupees(sum((l) => l.pending)), overdue: rupees(sum((l) => l.overdue)) },
    owedBack: { advances: rupees(out.advances), credit: rupees(out.credit) },
    lentOut: rupees(out.lentOutPaise),
    debts: { owed: d.owed, repaidThisMonth: d.repaidThisMonth,
      people: creditors.filter((c) => c.left > 0).map((c) => ({ id: c.id, name: c.name, left: c.left })) },
    trend: periods.map((period) => ({ period,
      byLedger: Object.fromEntries(out.ledgers.map((l) => [l.key, rupees(out.received[l.key][period])])) })),
    upcoming: out.soon.map((i) => listItem(i, unpaid(i))),
    overdueList: out.owed.filter((i) => i.date < today && unpaid(i) > 0).map((i) => listItem(i, unpaid(i))),
  });
}

async function getCalendar(req, res) {
  const { from, to, ledger } = req.query;
  if (!isValidDateStr(from) || !isValidDateStr(to)) throw new ValidationError('from and to must be YYYY-MM-DD dates');
  if (to < from) throw new ValidationError('to must not be before from');
  if (to > addDays(from, 366)) throw new ValidationError('range is limited to 366 days');
  if (ledger !== undefined && ledger !== 'lending' && !/^category:[1-9]\d{0,9}$/.test(ledger)) throw new ValidationError('invalid ledger');

  const items = await req.db.$transaction(async (tx) => {
    await syncAllActiveLoans(tx);
    await syncOwner(tx);
    const cats = await tx.category.findMany({ where: { archived: false } });
    return dueItems(tx, cats, from, to);
  }, { timeout: 30000 });
  res.json(items.filter((i) => ledger === undefined || i.ledgerKey === ledger).map((i) => ({
    date: i.date, ledgerKey: i.ledgerKey, ledgerName: i.ledgerName, title: i.title, amount: rupees(i.amountPaise),
    paid: rupees(i.paidPaise), status: i.status, link: i.link })));
}

module.exports = { monthParam, getOverview, getCalendar };
