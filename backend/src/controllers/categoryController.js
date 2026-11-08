// Categories → places → units. Every parent is requireOwned before a child is linked to it.
const { HttpError, NotFound, parseId, fields } = require('../lib/errors');
const { todayIST, toDateOnly, toDbDate, addMonths, clampDay } = require('../lib/dates');
const { buildSchedule } = require('../services/schedule');
const { monthParam } = require('./overviewController');
const { parseAmountPaise, fromPaise, toPaise } = require('../lib/money');
const { requireOwned } = require('../lib/ownerDb');
const { syncAgreement, unitStatus, currentRate, agreementBalances, scheduleInput } = require('../services/recurringSync');

// placeLabel '' = 2-level category (no top level): its units live in one hidden place the UI never shows.
const CATEGORY = { name: 'text', placeLabel: 'opt', unitLabel: 'text', payerLabel: 'text', color: 'opt', archived: 'bool' };
const PLACE = { name: 'text', address: 'opt', archived: 'bool' };
const UNIT = { name: 'text', notes: 'opt', archived: 'bool' };

function unitData(body, partial) {
  const data = fields(body, UNIT, partial);
  if (!partial || body.defaultAmount !== undefined) data.defaultAmount = fromPaise(parseAmountPaise(body.defaultAmount));
  return data;
}

async function listCategories(req, res) {
  const where = req.query.all === '1' ? {} : { archived: false };
  res.json(await req.db.category.findMany({ where, orderBy: { id: 'asc' } }));
}

function categoryData(body, partial) {
  const data = fields(body, CATEGORY, partial);
  if (!partial || 'placeLabel' in data) data.placeLabel = data.placeLabel ?? '';
  return data;
}

async function createCategory(req, res) {
  res.status(201).json(await req.db.category.create({ data: categoryData(req.body, false) }));
}

// Places → units, each unit with its active agreement (+ payer, rates) and dashboard status.
async function getCategory(req, res) {
  const id = parseId(req.params.id);
  const out = await req.db.$transaction(async (tx) => {
    const cat = await tx.category.findUnique({ where: { id }, include: { places: { orderBy: { id: 'asc' }, include: {
      units: { orderBy: { id: 'asc' }, include: { agreements: { where: { status: 'ACTIVE' },
        include: { payer: true, rateChanges: { orderBy: { effectiveFrom: 'asc' } } } } } } } } } });
    if (!cat) throw new NotFound('Category not found');
    const units = cat.places.flatMap((p) => p.units);
    // id order = syncOwner's lock order. ponytail: sync-on-read, one sync per occupied unit; fine at tens of units
    for (const a of units.flatMap((u) => u.agreements).sort((x, y) => x.id - y.id)) await syncAgreement(tx, a.id);
    for (const u of units) {
      const [agreement = null] = u.agreements;
      delete u.agreements;
      Object.assign(u, { agreement, status: await unitStatus(tx, u.id) });
    }
    return cat;
  }, { timeout: 30000 });
  res.json(out);
}

// Per-category dashboard. Stats cover the shown places (all, or ?placeId=); pending/overdue are as of today,
// "this month" is ?month= (default current IST month). Collected = allocations by payment date, including advance
// applied at move-out (an ADVANCE payment); deposits held and retained amounts are not collected.
async function getDashboard(req, res) {
  const id = parseId(req.params.id);
  const month = monthParam(req.query.month);
  const placeId = req.query.placeId === undefined ? null : parseId(req.query.placeId);
  const today = todayIST();
  const out = await req.db.$transaction(async (tx) => {
    const category = await requireOwned(tx, 'category', id);
    const places = await tx.place.findMany({ where: { categoryId: id, archived: false }, orderBy: { id: 'asc' } });
    if (placeId && !places.some((p) => p.id === placeId)) throw new NotFound('Place not found');
    const shown = places.filter((p) => !placeId || p.id === placeId);
    const inPlaces = { placeId: { in: shown.map((p) => p.id) } };
    const withAgreements = { include: { place: true, agreements: { where: { status: 'ACTIVE' }, include: { payer: true, rateChanges: true } } } };
    const unitRows = await tx.unit.findMany({ where: { archived: false, ...inPlaces }, orderBy: { id: 'asc' }, ...withAgreements });
    for (const a of unitRows.flatMap((u) => u.agreements).sort((x, y) => x.id - y.id)) await syncAgreement(tx, a.id);

    const units = [];
    for (const u of unitRows) {
      const [a] = u.agreements;
      units.push({ unitId: u.id, unitName: u.name, placeName: u.place.name,
        payer: a ? { id: a.payer.id, name: a.payer.name, phone: a.payer.phone } : null, agreementId: a?.id ?? null,
        amount: (a && currentRate(a.rateChanges, today)) ?? Number(u.defaultAmount), status: await unitStatus(tx, u.id) });
    }

    const inAgreement = { agreement: { unit: inPlaces } };
    const dues = await tx.recurringDue.findMany({ where: inAgreement });
    const sumUnpaid = (f) => dues.filter(f).reduce((s, d) => s + toPaise(d.amount) - toPaise(d.paidAmount), 0);
    const collected = await tx.recurringAllocation.findMany({ where: { due: inAgreement, payment: {
      paymentDate: { gte: toDbDate(`${month}-01`), lt: toDbDate(`${addMonths(month, 1)}-01`) } } }, select: { amount: true } });
    let advances = 0; let credit = 0;
    for (const a of await tx.agreement.findMany({ where: { unit: inPlaces }, orderBy: { id: 'asc' } })) {
      const b = await agreementBalances(tx, a.id);
      advances += b.advanceHeldPaise; credit += b.creditPaise;
    }
    // this month's dues not yet persisted (due date still ahead) come from the schedule
    const have = new Set(dues.map((d) => `${d.agreementId}|${d.period}`));
    let dueMonth = dues.filter((d) => d.period === month).reduce((s, d) => s + toPaise(d.amount), 0);
    for (const u of unitRows) for (const a of u.agreements) {
      for (const sc of buildSchedule(scheduleInput(a), clampDay(month, 31))) {
        if (sc.period === month && !have.has(`${a.id}|${month}`)) dueMonth += sc.amountPaise;
      }
    }
    const kept = await tx.advanceEntry.findMany({ where: { type: 'RETAINED', agreement: { unit: inPlaces },
      date: { gte: toDbDate(`${month}-01`), lt: toDbDate(`${addMonths(month, 1)}-01`) } }, select: { amount: true } });
    const stats = {
      dueThisMonth: dueMonth / 100,
      collectedThisMonth: collected.reduce((s, a) => s + toPaise(a.amount), 0) / 100,
      pending: sumUnpaid((d) => toDateOnly(d.dueDate) <= today) / 100,
      overdue: sumUnpaid((d) => toDateOnly(d.dueDate) < today) / 100,
      advanceRetained: kept.reduce((s, e) => s + toPaise(e.amount), 0) / 100,
      advancesHeld: advances / 100, credit: credit / 100,
      occupied: units.filter((u) => u.agreementId).length, totalUnits: units.length };
    return { category, places: places.map((p) => ({ id: p.id, name: p.name })), stats, units };
  }, { timeout: 30000 });
  res.json(out);
}

// Archiving hides the parent from dashboards, so it must not strand tenants who still owe/pay.
async function refuseArchiveWithActive(tx, data, label, unitWhere) {
  if (data.archived && await tx.agreement.count({ where: { status: 'ACTIVE', unit: unitWhere } })) {
    throw new HttpError(409, `${label} has active agreements; move them out first`);
  }
}

async function updateCategory(req, res) {
  const id = parseId(req.params.id);
  const data = categoryData(req.body, true);
  res.json(await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'category', id);
    await refuseArchiveWithActive(tx, data, 'Category', { place: { categoryId: id } });
    // 2 levels shows one place only; units in a second active place would vanish from the screens
    if (data.placeLabel === '' && await tx.place.count({ where: { categoryId: id, archived: false } }) > 1) {
      throw new HttpError(409, 'Category has more than one active top-level group; archive the extras first');
    }
    return tx.category.update({ where: { id }, data });
  }));
}

// Delete is allowed only while nothing under it ever had a tenant: agreements carry dues and payments,
// which must never disappear. Anything with history can be archived instead.
async function refuseDeleteWithHistory(tx, unitWhere, label) {
  if (await tx.agreement.count({ where: { unit: unitWhere } })) {
    throw new HttpError(409, `${label} has tenant history (current or past); archive it instead`);
  }
}

async function deleteCategory(req, res) {
  const id = parseId(req.params.id);
  await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'category', id);
    await refuseDeleteWithHistory(tx, { place: { categoryId: id } }, 'Category');
    await tx.unit.deleteMany({ where: { place: { categoryId: id } } });
    await tx.place.deleteMany({ where: { categoryId: id } });
    await tx.category.delete({ where: { id } });
  });
  res.json({ deleted: true });
}

async function deletePlace(req, res) {
  const id = parseId(req.params.id);
  await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'place', id);
    await refuseDeleteWithHistory(tx, { placeId: id }, 'This group');
    await tx.unit.deleteMany({ where: { placeId: id } });
    await tx.place.delete({ where: { id } });
  });
  res.json({ deleted: true });
}

async function deleteUnit(req, res) {
  const id = parseId(req.params.id);
  await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'unit', id);
    await refuseDeleteWithHistory(tx, { id }, 'This unit');
    await tx.unit.delete({ where: { id } });
  });
  res.json({ deleted: true });
}

async function createPlace(req, res) {
  const category = await requireOwned(req.db, 'category', parseId(req.params.id));
  const data = fields(req.body, PLACE);
  res.status(201).json(await req.db.place.create({ data: { ...data, categoryId: category.id } }));
}

async function updatePlace(req, res) {
  const id = parseId(req.params.id);
  const data = fields(req.body, PLACE, true);
  res.json(await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'place', id);
    await refuseArchiveWithActive(tx, data, 'Place', { placeId: id });
    return tx.place.update({ where: { id }, data });
  }));
}

async function createUnit(req, res) {
  const place = await requireOwned(req.db, 'place', parseId(req.params.id));
  const data = unitData(req.body, false);
  res.status(201).json(await req.db.unit.create({ data: { ...data, placeId: place.id } }));
}

async function updateUnit(req, res) {
  const id = parseId(req.params.id);
  const out = await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'unit', id);
    const data = unitData(req.body, true);
    if (data.archived && await tx.agreement.count({ where: { unitId: id, status: 'ACTIVE' } })) {
      throw new HttpError(409, 'Unit has an active agreement; move out first');
    }
    return tx.unit.update({ where: { id }, data });
  });
  res.json(out);
}

module.exports = { listCategories, createCategory, getCategory, getDashboard, updateCategory, deleteCategory,
  createPlace, updatePlace, deletePlace, createUnit, updateUnit, deleteUnit };
