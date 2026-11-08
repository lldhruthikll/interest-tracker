// Recurring dues: materialize from the schedule, then rebuild allocations from all payments (FIFO).
// Callers run these inside db.$transaction and pass the tx client. All arithmetic in integer paise.
const { buildSchedule } = require('./schedule');
const { planFifo } = require('./allocation');
const { toPaise, fromPaise } = require('../lib/money');
const { todayIST, toDateOnly, toDbDate, periodOf } = require('../lib/dates');

const sum = (rows, f = (r) => toPaise(r.amount)) => rows.reduce((s, r) => s + f(r), 0);

// A tenant's balance from before the app ("previous balance") is one due with this period: it sorts before
// every real month, so FIFO pays it first, and the schedule never produces or adjusts it.
const OPENING = '0000-00';

// Row lock held to transaction end. Raw SQL skips the owner scope: callers requireOwned first.
const lockAgreement = (db, id) => db.$queryRaw`SELECT id FROM "Agreement" WHERE id = ${id} FOR NO KEY UPDATE`;

// buildSchedule input from an agreement row loaded with rateChanges.
const scheduleInput = (a) => ({
  ...a,
  startDate: toDateOnly(a.startDate),
  endDate: a.endDate ? toDateOnly(a.endDate) : null,
  rates: a.rateChanges.map((r) => ({ effectiveFrom: r.effectiveFrom, amountPaise: toPaise(r.amount) })),
});

// Rent in force this month (rupees), falling back to the earliest rate; null with no rates.
function currentRate(rateChanges, today = todayIST()) {
  const sorted = [...rateChanges].sort((x, y) => (x.effectiveFrom < y.effectiveFrom ? -1 : 1));
  const r = sorted.filter((x) => x.effectiveFrom <= periodOf(today)).pop() ?? sorted[0];
  return r ? Number(r.amount) : null;
}

async function syncAgreement(db, agreementId, { until = todayIST(), materializeAll = false } = {}) {
  // Serialize writers per agreement; later READ COMMITTED statements then see the previous writer's commit.
  // NO KEY UPDATE, not UPDATE: callers insert FK children (KEY SHARE on this row) before syncing, and
  // FOR UPDATE would deadlock two such writers.
  await lockAgreement(db, agreementId);
  const a = await db.agreement.findUniqueOrThrow({ where: { id: agreementId }, include: { rateChanges: true } });
  const input = scheduleInput(a);
  const schedule = buildSchedule(input, materializeAll ? null : until);
  const existing = new Map((await db.recurringDue.findMany({ where: { agreementId } })).map((d) => [d.period, d]));

  const missing = schedule.filter((s) => !existing.has(s.period));
  if (missing.length) {
    await db.recurringDue.createMany({ data: missing.map((s) => ({
      agreementId, period: s.period, dueDate: toDbDate(s.dueDate), amount: fromPaise(s.amountPaise) })) });
  }
  // ENDED: a materialized final due can lie past `until`, so re-adjust against the full schedule
  for (const s of a.status === 'ENDED' ? buildSchedule(input, null) : schedule) {
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
  const dues = (await db.recurringDue.findMany({ where: { agreementId }, orderBy: { period: 'asc' } }))
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
  for (const a of await db.agreement.findMany({ where: { status: 'ACTIVE' }, select: { id: true }, orderBy: { id: 'asc' } })) {
    await syncAgreement(db, a.id);
  }
}

// Sync every active agreement in a category (id order = syncOwner's lock order). Callers pass a tx.
async function syncCategory(db, categoryId) {
  const active = await db.agreement.findMany({ where: { status: 'ACTIVE', unit: { place: { categoryId } } },
    select: { id: true }, orderBy: { id: 'asc' } });
  for (const a of active) await syncAgreement(db, a.id);
}

// Dashboard status of a unit: first match wins. Callers sync the active agreement first.
async function unitStatus(db, unitId) {
  const a = await db.agreement.findFirst({ where: { unitId, status: 'ACTIVE' }, select: { id: true } });
  if (!a) return 'VACANT';
  if ((await agreementBalances(db, a.id)).overduePaise > 0) return 'OVERDUE';
  const dues = await db.recurringDue.findMany({ where: { agreementId: a.id }, orderBy: { period: 'asc' } });
  const today = todayIST();
  if (dues.some((d) => d.status !== 'PAID' && toDateOnly(d.dueDate) === today)) return 'DUE_TODAY';
  if (dues.at(-1)?.status === 'PARTIALLY_PAID') return 'PARTIAL';
  if (dues.length && dues.every((d) => d.status === 'PAID')) return 'PAID';
  return 'UPCOMING';
}

module.exports = { OPENING, scheduleInput, currentRate, lockAgreement, syncAgreement, reallocate, agreementBalances, syncOwner, syncCategory, unitStatus };
