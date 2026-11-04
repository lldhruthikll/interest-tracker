// Recurring payments: every write ends in syncAgreement, which rebuilds allocations from scratch.
const { parseAmountPaise, toPaise, fromPaise } = require('../lib/money');
const { ValidationError, parseId } = require('../lib/errors');
const { todayIST, toDateOnly, toDbDate, isValidDateStr } = require('../lib/dates');
const { requireOwned } = require('../lib/ownerDb');
const { syncAgreement, agreementBalances } = require('../services/recurringSync');

const METHODS = ['CASH', 'UPI', 'BANK', 'CHEQUE']; // ADVANCE is created only by settlement

function validate(agreement, { amount, paymentDate, method, notes }) {
  const amountPaise = parseAmountPaise(amount);
  if (!METHODS.includes(method)) throw new ValidationError(`Method must be one of ${METHODS.join(', ')}`);
  if (!isValidDateStr(paymentDate)) throw new ValidationError('paymentDate must be a valid YYYY-MM-DD date');
  if (paymentDate < toDateOnly(agreement.startDate)) throw new ValidationError('Payment date is before the agreement start');
  if (agreement.status === 'ENDED' && agreement.endDate && paymentDate > toDateOnly(agreement.endDate)) {
    throw new ValidationError('Payment date is after the agreement end');
  }
  if (paymentDate > todayIST()) throw new ValidationError('Payment date cannot be in the future');
  if (notes != null && typeof notes !== 'string') throw new ValidationError('Notes must be text');
  return { amount: fromPaise(amountPaise), paymentDate: toDbDate(paymentDate), method, notes: notes || null };
}

async function finish(tx, agreementId, payment) {
  await syncAgreement(tx, agreementId);
  return { payment, balances: await agreementBalances(tx, agreementId) };
}

async function requireEditable(tx, id) {
  const p = await requireOwned(tx, 'recurringPayment', id);
  if (p.method === 'ADVANCE') throw new ValidationError('Advance-applied payments are managed by settlement');
  return p;
}

async function createPayment(req, res) {
  const { agreementId, amount, paymentDate = todayIST(), method = 'CASH', notes } = req.body;
  const out = await req.db.$transaction(async (tx) => {
    const agreement = await requireOwned(tx, 'agreement', parseId(agreementId));
    const data = validate(agreement, { amount, paymentDate, method, notes });
    const payment = await tx.recurringPayment.create({ data: { ...data, agreementId: agreement.id } });
    return finish(tx, agreement.id, payment);
  });
  res.status(201).json(out);
}

async function updatePayment(req, res) {
  const id = parseId(req.params.id);
  const out = await req.db.$transaction(async (tx) => {
    const old = await requireEditable(tx, id);
    const agreement = await requireOwned(tx, 'agreement', old.agreementId);
    const pick = (k, v) => (req.body[k] !== undefined ? req.body[k] : v);
    const data = validate(agreement, {
      amount: pick('amount', fromPaise(toPaise(old.amount))),
      paymentDate: pick('paymentDate', toDateOnly(old.paymentDate)),
      method: pick('method', old.method),
      notes: pick('notes', old.notes),
    });
    const payment = await tx.recurringPayment.update({ where: { id }, data });
    return finish(tx, agreement.id, payment);
  });
  res.json(out);
}

async function deletePayment(req, res) {
  const id = parseId(req.params.id);
  const out = await req.db.$transaction(async (tx) => {
    const old = await requireEditable(tx, id);
    await tx.recurringPayment.delete({ where: { id } });
    return finish(tx, old.agreementId, null);
  });
  res.json(out);
}

module.exports = { createPayment, updatePayment, deletePayment };
