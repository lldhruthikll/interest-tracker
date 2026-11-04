// Recurring dues: materialize from the schedule, then rebuild allocations from all payments (FIFO).
// Callers run these inside db.$transaction and pass the tx client. All arithmetic in integer paise.
const { buildSchedule } = require('./schedule');
const { planFifo } = require('./allocation');
const { toPaise, fromPaise } = require('../lib/money');
const { todayIST, toDateOnly, toDbDate } = require('../lib/dates');

const sum = (rows, f = (r) => toPaise(r.amount)) => rows.reduce((s, r) => s + f(r), 0);

async function syncAgreement(db, agreementId, { until = todayIST(), materializeAll = false } = {}) {
  const a = await db.agreement.findUniqueOrThrow({ where: { id: agreementId }, include: { rateChanges: true } });
  const input = {
    ...a,
    startDate: toDateOnly(a.startDate),
    endDate: a.endDate ? toDateOnly(a.endDate) : null,
    rates: a.rateChanges.map((r) => ({ effectiveFrom: r.effectiveFrom, amountPaise: toPaise(r.amount) })),
  };
  const schedule = buildSchedule(input, materializeAll ? null : until);
  const existing = new Map((await db.recurringDue.findMany({ where: { agreementId } })).map((d) => [d.period, d]));

  const missing = schedule.filter((s) => !existing.has(s.period));
  if (missing.length) {
    await db.recurringDue.createMany({ data: missing.map((s) => ({
      agreementId, period: s.period, dueDate: toDbDate(s.dueDate), amount: fromPaise(s.amountPaise) })) });
  }
  for (const s of schedule) {
    const d = existing.get(s.period);
    // unpaid dues follow the schedule; a paid due may only shrink, on move-out (excess → credit via reallocate)
    const cur = d && toPaise(d.amount);
    if (d && cur !== s.amountPaise && (toPaise(d.paidAmount) === 0 || (a.status === 'ENDED' && s.amountPaise < cur))) {
      await db.recurringDue.update({ where: { id: d.id }, data: { amount: fromPaise(s.amountPaise) } });
    }
  }
  if (a.status === 'ENDED') {
    // judge against the full schedule: an `until` cut-off must not delete a real final due
    const last = buildSchedule(input, null).pop()?.period ?? '';
    await db.recurringDue.deleteMany({ where: { agreementId, period: { gt: last } } });
  }
  await reallocate(db, agreementId);
}

async function reallocate(db, agreementId) {
  await db.recurringAllocation.deleteMany({ where: { due: { agreementId } } });
  const dues = (await db.recurringDue.findMany({ where: { agreementId }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] }))
    .map((d) => ({ id: d.id, amountPaise: toPaise(d.amount), paidPaise: 0, old: d }));
  const payments = await db.recurringPayment.findMany({ where: { agreementId }, orderBy: [{ paymentDate: 'asc' }, { id: 'asc' }] });
  const byId = new Map(dues.map((d) => [d.id, d]));
  const rows = [];
  for (const p of payments) {
    for (const al of planFifo(dues, toPaise(p.amount)).allocations) {
      byId.get(al.dueId).paidPaise += al.amountPaise;
      rows.push({ paymentId: p.id, dueId: al.dueId, amount: fromPaise(al.amountPaise) });
    }
  }
  if (rows.length) await db.recurringAllocation.createMany({ data: rows });
  for (const d of dues) {
    const status = d.paidPaise >= d.amountPaise ? 'PAID' : d.paidPaise > 0 ? 'PARTIALLY_PAID' : 'PENDING';
    if (toPaise(d.old.paidAmount) !== d.paidPaise || d.old.status !== status) {
      await db.recurringDue.update({ where: { id: d.id }, data: { paidAmount: fromPaise(d.paidPaise), status } });
    }
  }
}

async function agreementBalances(db, agreementId) {
  const where = { where: { agreementId } };
  // sequential: callers pass an interactive-transaction client
  const dues = await db.recurringDue.findMany(where);
  const payments = await db.recurringPayment.findMany(where);
  const allocations = await db.recurringAllocation.findMany({ where: { due: { agreementId } } });
  const advances = await db.advanceEntry.findMany(where);
  const today = todayIST();
  const unpaid = (d) => toPaise(d.amount) - toPaise(d.paidAmount);
  const adv = (type) => sum(advances.filter((e) => e.type === type));
  return {
    duePaise: sum(dues),
    unpaidPaise: sum(dues, unpaid),
    overduePaise: sum(dues.filter((d) => toDateOnly(d.dueDate) < today), unpaid),
    creditPaise: sum(payments) - sum(allocations) - adv('CREDIT_REFUNDED'),
    advanceHeldPaise: adv('RECEIVED') - adv('APPLIED_TO_RENT') - adv('RETAINED') - adv('REFUNDED'),
  };
}

async function syncOwner(db) {
  // ponytail: sync-on-read; move to a daily job if slow
  for (const a of await db.agreement.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })) {
    await syncAgreement(db, a.id);
  }
}

module.exports = { syncAgreement, reallocate, agreementBalances, syncOwner };
