// Money I owe: creditors and their log of BORROWED / REPAID entries. Left = borrowed − repaid, never below 0.
// A REPAID entry with paymentId came from a tenant's rent payment (linkRepayment) and changes only through that payment.
const { HttpError, ValidationError, parseId, fields } = require('../lib/errors');
const { parseAmountPaise, toPaise, fromPaise } = require('../lib/money');
const { todayIST, toDateOnly, toDbDate, isValidDateStr, periodOf } = require('../lib/dates');
const { requireOwned } = require('../lib/ownerDb');

const CREDITOR = { name: 'text', phone: 'opt', notes: 'opt' };
const TYPES = ['BORROWED', 'REPAID'];

// callers requireOwned first; the row lock serialises balance checks for one creditor
const lockCreditor = (tx, id) => tx.$queryRaw`SELECT id FROM "Creditor" WHERE id = ${id} FOR UPDATE`;

function dateParam(v) {
  const d = v ?? todayIST();
  if (!isValidDateStr(d)) throw new ValidationError('date must be a valid YYYY-MM-DD date');
  if (d > todayIST()) throw new ValidationError('date cannot be in the future');
  return toDbDate(d);
}

function totals(entries) {
  let borrowed = 0; let repaid = 0; let lastPaid = null;
  for (const e of entries) {
    if (e.type === 'BORROWED') borrowed += toPaise(e.amount);
    else {
      repaid += toPaise(e.amount);
      const d = toDateOnly(e.date);
      if (!lastPaid || d > lastPaid) lastPaid = d;
    }
  }
  return { borrowedPaise: borrowed, repaidPaise: repaid, leftPaise: borrowed - repaid, lastPaid };
}

async function leftPaise(tx, creditorId) {
  return totals(await tx.debtEntry.findMany({ where: { creditorId }, select: { type: true, amount: true, date: true } })).leftPaise;
}

async function createCreditorWithDebt(tx, body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Person details are required');
  const data = fields(body, CREDITOR);
  const amount = fromPaise(parseAmountPaise(body.amount));
  const date = dateParam(body.date);
  const creditor = await tx.creditor.create({ data });
  await tx.debtEntry.create({ data: { creditorId: creditor.id, type: 'BORROWED', amount, date } });
  return creditor;
}

// Inside a rent payment's transaction, after the payment row is written. repayTo:
//   undefined → keep the current link, re-capped to the payment's new amount/date (edit path)
//   null → no link; { creditorId } → link to that person; { newCreditor: {name, phone, amount, date} } → create, then link
// Passes on min(payment amount, what is still owed); the rest stays with the owner.
async function linkRepayment(tx, payment, repayTo) {
  const old = await tx.debtEntry.findUnique({ where: { paymentId: payment.id } });
  if (repayTo === undefined && !old) return null;
  if (old) await tx.debtEntry.delete({ where: { id: old.id } });
  const target = repayTo === undefined ? { creditorId: old.creditorId } : repayTo;
  if (target === null) return null;
  if (typeof target !== 'object') throw new ValidationError('repayTo must be an object or null');
  // created from the rent box: borrowed no later than this first repayment unless a date is given
  const creditor = target.newCreditor ? await createCreditorWithDebt(tx, { date: toDateOnly(payment.paymentDate), ...target.newCreditor })
    : await requireOwned(tx, 'creditor', parseId(target.creditorId));
  await lockCreditor(tx, creditor.id);
  const left = await leftPaise(tx, creditor.id);
  if (left <= 0) {
    if (repayTo === undefined) return null; // repaid in full by other entries since; nothing left to pass on
    throw new ValidationError(`${creditor.name} is already fully repaid`);
  }
  return tx.debtEntry.create({ data: { creditorId: creditor.id, type: 'REPAID', paymentId: payment.id,
    date: payment.paymentDate, amount: fromPaise(Math.min(toPaise(payment.amount), left)) } });
}

// For the rent payment box: the person this agreement's latest payment was passed on to, if still owed.
async function suggestedCreditorId(tx, latestPayment) {
  const id = latestPayment?.debtEntry?.creditorId;
  return id && await leftPaise(tx, id) > 0 ? id : null;
}

const rupees = (t) => ({ borrowed: t.borrowedPaise / 100, repaid: t.repaidPaise / 100, left: t.leftPaise / 100, lastPaid: t.lastPaid });

async function listCreditors(req, res) {
  const rows = await req.db.creditor.findMany({ orderBy: { name: 'asc' },
    include: { entries: { select: { type: true, amount: true, date: true } } } });
  const month = periodOf(todayIST());
  let owed = 0; let repaid = 0; let repaidThisMonth = 0;
  const creditors = rows.map(({ entries, ...c }) => {
    const t = totals(entries);
    owed += t.leftPaise; repaid += t.repaidPaise;
    for (const e of entries) if (e.type === 'REPAID' && periodOf(toDateOnly(e.date)) === month) repaidThisMonth += toPaise(e.amount);
    return { ...c, ...rupees(t) };
  }).sort((a, b) => (a.left > 0 ? 0 : 1) - (b.left > 0 ? 0 : 1)); // still owed first, then cleared; name order kept
  res.json({ totals: { owed: owed / 100, repaid: repaid / 100, repaidThisMonth: repaidThisMonth / 100 }, creditors });
}

async function createCreditor(req, res) {
  res.status(201).json(await req.db.$transaction((tx) => createCreditorWithDebt(tx, req.body)));
}

function message(e, creditorName) {
  if (e.type === 'BORROWED') return 'Borrowed';
  if (!e.payment) return 'Repaid (own money)';
  const { unit, payer } = e.payment.agreement;
  const where = unit.place.category.placeLabel ? `${unit.name}, ${unit.place.name}` : unit.name;
  return `Rent from ${where} (${payer.name}) paid to ${creditorName}`;
}

async function getCreditor(req, res) {
  const id = parseId(req.params.id);
  const c = await requireOwned(req.db, 'creditor', id);
  const entries = await req.db.debtEntry.findMany({ where: { creditorId: id }, orderBy: [{ date: 'desc' }, { id: 'desc' }],
    include: { payment: { include: { agreement: { include: { payer: true, unit: { include: { place: { include: { category: true } } } } } } } } } });
  res.json({ ...c, ...rupees(totals(entries)), entries: entries.map((e) => ({ id: e.id, type: e.type, amount: e.amount,
    date: toDateOnly(e.date), notes: e.notes, agreementId: e.payment?.agreementId ?? null, message: message(e, c.name) })) });
}

async function updateCreditor(req, res) {
  const id = parseId(req.params.id);
  await requireOwned(req.db, 'creditor', id);
  res.json(await req.db.creditor.update({ where: { id }, data: fields(req.body, CREDITOR, true) }));
}

// Removes the person and their whole log; linked rent payments stay, only the link goes.
async function deleteCreditor(req, res) {
  const id = parseId(req.params.id);
  await requireOwned(req.db, 'creditor', id);
  await req.db.creditor.delete({ where: { id } });
  res.json({ deleted: true });
}

async function addEntry(req, res) {
  const id = parseId(req.params.id);
  const { type, notes } = req.body;
  if (!TYPES.includes(type)) throw new ValidationError(`type must be one of ${TYPES.join(', ')}`);
  if (notes != null && typeof notes !== 'string') throw new ValidationError('Notes must be text');
  const amountPaise = parseAmountPaise(req.body.amount);
  const date = dateParam(req.body.date);
  const out = await req.db.$transaction(async (tx) => {
    await requireOwned(tx, 'creditor', id);
    await lockCreditor(tx, id);
    if (type === 'REPAID' && amountPaise > await leftPaise(tx, id)) throw new ValidationError('Repayment is more than what is still owed');
    return tx.debtEntry.create({ data: { creditorId: id, type, amount: fromPaise(amountPaise), date, notes: notes?.trim() || null } });
  });
  res.status(201).json(out);
}

async function deleteEntry(req, res) {
  const id = parseId(req.params.id);
  await req.db.$transaction(async (tx) => {
    const e = await requireOwned(tx, 'debtEntry', id);
    if (e.paymentId) throw new HttpError(409, 'This line came from a rent payment; edit or delete that payment instead');
    await lockCreditor(tx, e.creditorId);
    if (e.type === 'BORROWED' && await leftPaise(tx, e.creditorId) < toPaise(e.amount)) {
      throw new HttpError(409, 'Deleting this would make the amount owed negative');
    }
    await tx.debtEntry.delete({ where: { id } });
  });
  res.json({ deleted: true });
}

module.exports = { listCreditors, createCreditor, getCreditor, updateCreditor, deleteCreditor, addEntry, deleteEntry,
  linkRepayment, suggestedCreditorId };
