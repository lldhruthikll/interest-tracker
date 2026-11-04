// Payers (shared across the owner's categories) and their optional PAYER login.
const bcrypt = require('bcryptjs');
const { HttpError, ValidationError, NotFound, parseId, fields } = require('../lib/errors');
const { requireOwned } = require('../lib/ownerDb');
const { syncAgreement, agreementBalances } = require('../services/recurringSync');
const { minPw } = require('./adminController');

const PAYER = { name: 'text', phone: 'text', notes: 'opt' };
const LOGIN = { select: { username: true, active: true } };
const withLogin = ({ user, ...p }) => ({ ...p, login: user || null });

async function listPayers(req, res) {
  const s = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const where = s ? { OR: [{ name: { contains: s, mode: 'insensitive' } }, { phone: { contains: s } }] } : {};
  const payers = await req.db.payer.findMany({ where, orderBy: { name: 'asc' }, include: { user: LOGIN,
    agreements: { where: { status: 'ACTIVE' }, select: { id: true, unit: { select: { id: true, name: true } } } } } });
  res.json(payers.map(withLogin));
}

async function createPayer(req, res) {
  res.status(201).json(await req.db.payer.create({ data: fields(req.body, PAYER) }));
}

// All agreements across categories, each with balances; active ones are synced first.
async function getPayer(req, res) {
  const id = parseId(req.params.id);
  const out = await req.db.$transaction(async (tx) => {
    const payer = await requireOwned(tx, 'payer', id);
    const agreements = await tx.agreement.findMany({ where: { payerId: id }, orderBy: { id: 'asc' },
      include: { unit: { include: { place: { include: { category: true } } } }, rateChanges: { orderBy: { effectiveFrom: 'asc' } } } });
    for (const a of agreements) {
      if (a.status === 'ACTIVE') await syncAgreement(tx, a.id);
      a.balances = await agreementBalances(tx, a.id);
    }
    const user = await tx.user.findUnique({ where: { payerId: id }, ...LOGIN });
    return { ...withLogin({ ...payer, user }), agreements };
  });
  res.json(out);
}

async function updatePayer(req, res) {
  const id = parseId(req.params.id);
  await requireOwned(req.db, 'payer', id);
  res.json(await req.db.payer.update({ where: { id }, data: fields(req.body, PAYER, true) }));
}

async function createLogin(req, res) {
  const payer = await requireOwned(req.db, 'payer', parseId(req.params.id));
  const { username } = fields(req.body, { username: 'text' });
  minPw(req.body.password);
  if (await req.db.user.findUnique({ where: { payerId: payer.id } })) throw new HttpError(409, 'Payer already has a login');
  // duplicate username or a concurrent login for this payer → P2002 → 409
  const user = await req.db.user.create({ ...LOGIN, data: { username, name: payer.name, role: 'PAYER', payerId: payer.id,
    password: await bcrypt.hash(req.body.password, 10), mustChangePassword: true } });
  res.status(201).json(user);
}

async function updateLogin(req, res) {
  const payer = await requireOwned(req.db, 'payer', parseId(req.params.id));
  const user = await req.db.user.findUnique({ where: { payerId: payer.id } });
  if (!user) throw new NotFound('Payer has no login');
  const { password, active } = req.body;
  const data = {};
  if (password !== undefined) { minPw(password); data.password = await bcrypt.hash(password, 10); data.mustChangePassword = true; }
  if (active !== undefined) {
    if (typeof active !== 'boolean') throw new ValidationError('active must be true or false');
    data.active = active;
  }
  res.json(await req.db.user.update({ where: { id: user.id }, data, ...LOGIN }));
}

module.exports = { listPayers, createPayer, getPayer, updatePayer, createLogin, updateLogin };
