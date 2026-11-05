// Agreements: move-in, billing/rate changes, extra advance, move-out settlement (spec §7).
// Writes: one transaction of requireOwned → row lock → re-read → change → syncAgreement.
const { HttpError, ValidationError, parseId, fields } = require('../lib/errors');
const { parseAmountPaise, fromPaise } = require('../lib/money');
const { todayIST, toDateOnly, toDbDate, isValidDateStr, periodOf, addMonths, clampDay } = require('../lib/dates');
const { requireOwned } = require('../lib/ownerDb');
const { buildSchedule } = require('../services/schedule');
const { lockAgreement, syncAgreement, reallocate, agreementBalances } = require('../services/recurringSync');

const TIMINGS = ['IN_ADVANCE', 'IN_ARREARS'];
const RULES = ['PRORATED', 'FULL', 'FREE'];
const DEFAULTS = { timing: 'IN_ADVANCE', firstMonthRule: 'PRORATED', lastMonthRule: 'PRORATED' };

const oneOf = (list) => (v, k) => {
  if (!list.includes(v)) throw new ValidationError(`${k} must be one of ${list.join(', ')}`);
  return v;
};
const BILLING = {
  dueDay: (v) => {
    const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
    if (!Number.isInteger(n) || n < 1 || n > 31) throw new ValidationError('dueDay must be a whole number from 1 to 31');
    return n;
  },
  timing: oneOf(TIMINGS), firstMonthRule: oneOf(RULES), lastMonthRule: oneOf(RULES),
};
function billing(body, partial = false) {
  const out = {};
  for (const [k, check] of Object.entries(BILLING)) if (!partial || body[k] !== undefined) out[k] = check(body[k], k);
  return out;
}
function date(v, k) {
  if (!isValidDateStr(v)) throw new ValidationError(`${k} must be a valid YYYY-MM-DD date`);
  return v;
}
const money = (v) => fromPaise(parseAmountPaise(v));

async function detail(tx, id) {
  const a = await tx.agreement.findUnique({ where: { id }, include: {
    unit: { include: { place: { include: { category: true } } } }, payer: true,
    rateChanges: { orderBy: { effectiveFrom: 'asc' } }, dues: { orderBy: { period: 'asc' } },
    payments: { orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }], include: { allocations: true } },
    advances: { orderBy: { id: 'asc' } } } });
  const pastAgreements = await tx.agreement.findMany({ where: { unitId: a.unitId, id: { not: id } },
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    select: { id: true, payer: { select: { id: true, name: true } }, startDate: true, endDate: true, status: true } });
  return { ...a, balances: await agreementBalances(tx, id), pastAgreements };
}

// requireOwned (404), lock, then re-read so the status check sees the last committed writer.
async function lockActive(tx, id) {
  await requireOwned(tx, 'agreement', id);
  await lockAgreement(tx, id);
  const a = await tx.agreement.findUnique({ where: { id } });
  if (a.status !== 'ACTIVE') throw new HttpError(409, 'Agreement has ended');
  return a;
}

// First two dues of a would-be agreement (end two months out so the first two are never cut short).
async function previewAgreement(req, res) {
  const startDate = date(req.body.startDate, 'startDate');
  const a = { ...billing({ ...DEFAULTS, ...req.body, lastMonthRule: 'FULL' }), startDate,
    endDate: clampDay(addMonths(periodOf(startDate), 2), 31),
    rates: [{ effectiveFrom: periodOf(startDate), amountPaise: parseAmountPaise(req.body.amount) }] };
  res.json(buildSchedule(a, null).slice(0, 2).map((s) => ({ period: s.period, dueDate: s.dueDate, amount: s.amountPaise / 100 })));
}

async function createAgreement(req, res) {
  const b = req.body;
  const startDate = date(b.startDate, 'startDate');
  const settings = billing({ ...DEFAULTS, ...b });
  const amount = money(b.amount);
  const unitId = parseId(b.unitId);
  const payerId = b.payerId != null ? parseId(b.payerId) : null;
  if (payerId === null && (typeof b.newPayer !== 'object' || !b.newPayer)) throw new ValidationError('payerId or newPayer is required');
  const newPayer = payerId === null && fields(b.newPayer, { name: 'text', phone: 'text' });
  const advance = b.advanceAmount != null &&
    { amount: money(b.advanceAmount), date: toDbDate(date(b.advanceDate ?? startDate, 'advanceDate')) };
  const { notes = null } = fields(b, { notes: 'opt' });

  const out = await req.db.$transaction(async (tx) => {
    const unit = await requireOwned(tx, 'unit', unitId);
    if (unit.archived) throw new ValidationError('Unit is archived');
    const payer = payerId !== null ? await requireOwned(tx, 'payer', payerId) : await tx.payer.create({ data: newPayer });
    // second ACTIVE agreement on the unit → partial unique index → P2002 → 409
    const a = await tx.agreement.create({ data: { unitId, payerId: payer.id, startDate: toDbDate(startDate), ...settings, notes } });
    await tx.rateChange.create({ data: { agreementId: a.id, amount, effectiveFrom: periodOf(startDate) } });
    if (advance) await tx.advanceEntry.create({ data: { agreementId: a.id, type: 'RECEIVED', ...advance } });
    await syncAgreement(tx, a.id);
    return detail(tx, a.id);
  });
  res.status(201).json(out);
}

async function getAgreement(req, res) {
  const id = parseId(req.params.id);
  res.json(await req.db.$transaction(async (tx) => {
    const a = await requireOwned(tx, 'agreement', id);
    if (a.status === 'ACTIVE') await syncAgreement(tx, id);
    return detail(tx, id);
  }, { timeout: 30000 }));
}

async function updateBilling(req, res) {
  const id = parseId(req.params.id);
  res.json(await req.db.$transaction(async (tx) => {
    await lockActive(tx, id);
    await tx.agreement.update({ where: { id }, data: billing(req.body, true) });
    // never touch collected money: drop dues with nothing paid; sync regenerates them on the new settings
    await tx.recurringDue.deleteMany({ where: { agreementId: id, paidAmount: 0 } });
    await syncAgreement(tx, id);
    return detail(tx, id);
  }));
}

async function addRate(req, res) {
  const id = parseId(req.params.id);
  res.json(await req.db.$transaction(async (tx) => {
    const a = await lockActive(tx, id);
    const { effectiveFrom } = req.body;
    if (typeof effectiveFrom !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveFrom)) {
      throw new ValidationError('effectiveFrom must be YYYY-MM');
    }
    if (effectiveFrom < periodOf(toDateOnly(a.startDate))) throw new ValidationError('effectiveFrom is before the agreement start');
    const amount = money(req.body.amount);
    await tx.rateChange.upsert({ where: { agreementId_effectiveFrom: { agreementId: id, effectiveFrom } },
      create: { agreementId: id, effectiveFrom, amount }, update: { amount } });
    await syncAgreement(tx, id); // unpaid dues from effectiveFrom follow the new rate; paid ones keep theirs
    return detail(tx, id);
  }));
}

async function addAdvance(req, res) {
  const id = parseId(req.params.id);
  const out = await req.db.$transaction(async (tx) => {
    await lockActive(tx, id);
    if (req.body.type !== 'RECEIVED') throw new ValidationError('Only RECEIVED can be added; the rest is done at move-out');
    const entry = await tx.advanceEntry.create({ data: { agreementId: id, type: 'RECEIVED', amount: money(req.body.amount),
      date: toDbDate(date(req.body.date, 'date')), notes: fields(req.body, { notes: 'opt' }).notes ?? null } });
    return { entry, balances: await agreementBalances(tx, id) };
  });
  res.status(201).json(out);
}

// End the agreement and materialize every due through the end month (a paid final due may shrink → credit).
async function endAgreement(tx, req) {
  const id = parseId(req.params.id);
  const a = await lockActive(tx, id);
  const endDate = date(req.body.endDate, 'endDate');
  if (endDate < toDateOnly(a.startDate)) throw new ValidationError('endDate is before the agreement start');
  if (endDate > todayIST()) throw new ValidationError('endDate cannot be in the future');
  const lastMonthRule = oneOf(RULES)(req.body.lastMonthRule ?? a.lastMonthRule, 'lastMonthRule');
  await tx.agreement.update({ where: { id }, data: { endDate: toDbDate(endDate), lastMonthRule, status: 'ENDED' } });
  await syncAgreement(tx, id, { materializeAll: true });
  return { id, endDate };
}

class Rollback extends Error {} // private sentinel: aborts the preview transaction

async function moveOutPreview(req, res) {
  try {
    await req.db.$transaction(async (tx) => {
      const { id } = await endAgreement(tx, req);
      const { unpaidPaise, advanceHeldPaise, creditPaise } = await agreementBalances(tx, id);
      const r = new Rollback();
      r.result = { dues: await tx.recurringDue.findMany({ where: { agreementId: id }, orderBy: { period: 'asc' } }),
        unpaidPaise, advanceHeldPaise, creditPaise };
      throw r;
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    res.json(e.result);
  }
}

// Settlement: apply advance to unpaid dues (ADVANCE payment), retain, refund the rest, refund credit.
async function moveOut(req, res) {
  const out = await req.db.$transaction(async (tx) => {
    const { id, endDate } = await endAgreement(tx, req);
    const { applyAdvance = false, retained = null } = req.body;
    if (typeof applyAdvance !== 'boolean') throw new ValidationError('applyAdvance must be true or false');
    if (retained !== null && typeof retained !== 'object') throw new ValidationError('retained must be {amount, notes} or null');
    const retainedPaise = retained ? parseAmountPaise(retained.amount) : 0;

    const day = toDbDate(endDate);
    const entry = (type, paise, extra) =>
      tx.advanceEntry.create({ data: { agreementId: id, type, amount: fromPaise(paise), date: day, ...extra } });
    let b = await agreementBalances(tx, id);
    const applied = applyAdvance ? Math.min(b.advanceHeldPaise, b.unpaidPaise) : 0;
    if (applied > 0) {
      const p = await tx.recurringPayment.create({ data: { agreementId: id, amount: fromPaise(applied), paymentDate: day,
        method: 'ADVANCE', notes: 'Advance applied at move-out' } });
      await entry('APPLIED_TO_RENT', applied, { paymentId: p.id });
      await reallocate(tx, id);
      b = await agreementBalances(tx, id);
    }
    if (retainedPaise > b.advanceHeldPaise) throw new ValidationError('Retained amount is more than the advance held');
    if (retainedPaise) await entry('RETAINED', retainedPaise, { notes: fields(retained, { notes: 'opt' }).notes ?? null });
    if (b.advanceHeldPaise - retainedPaise > 0) await entry('REFUNDED', b.advanceHeldPaise - retainedPaise);
    if (b.creditPaise > 0) await entry('CREDIT_REFUNDED', b.creditPaise);
    return agreementBalances(tx, id);
  });
  res.json(out);
}

module.exports = { previewAgreement, createAgreement, getAgreement, updateBilling, addRate, addAdvance, moveOutPreview, moveOut };
