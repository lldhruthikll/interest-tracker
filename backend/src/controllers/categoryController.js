// Categories → places → units. Every parent is requireOwned before a child is linked to it.
const { HttpError, NotFound, parseId, fields } = require('../lib/errors');
const { parseAmountPaise, fromPaise } = require('../lib/money');
const { requireOwned } = require('../lib/ownerDb');
const { syncAgreement, unitStatus } = require('../services/recurringSync');

const CATEGORY = { name: 'text', placeLabel: 'text', unitLabel: 'text', payerLabel: 'text', color: 'opt', archived: 'bool' };
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

async function createCategory(req, res) {
  res.status(201).json(await req.db.category.create({ data: fields(req.body, CATEGORY) }));
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
  });
  res.json(out);
}

async function updateCategory(req, res) {
  const id = parseId(req.params.id);
  const data = fields(req.body, CATEGORY, true);
  await requireOwned(req.db, 'category', id);
  res.json(await req.db.category.update({ where: { id }, data }));
}

async function deleteCategory(req, res) {
  const id = parseId(req.params.id);
  await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'category', id);
    if (await tx.place.count({ where: { categoryId: id } })) throw new HttpError(409, 'Category has places; archive it instead');
    await tx.category.delete({ where: { id } });
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
  await requireOwned(req.db, 'place', id);
  res.json(await req.db.place.update({ where: { id }, data: fields(req.body, PLACE, true) }));
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

module.exports = { listCategories, createCategory, getCategory, updateCategory, deleteCategory,
  createPlace, updatePlace, createUnit, updateUnit };
