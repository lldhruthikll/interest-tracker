// Payer portal: the payer's own agreements, read via a client pinned to the payer's owner and filtered by payerId.
// Nothing from the request selects data; only req.user.payerId (from the verified token's user row).
const prisma = require('../config/db');
const { forOwner } = require('../lib/ownerDb');
const { HttpError } = require('../lib/errors');
const { toDateOnly } = require('../lib/dates');
const { syncAgreement, agreementBalances, currentRate } = require('../services/recurringSync');

async function me(req, res) {
  const payer = req.user.payerId && await prisma.payer.findUnique({ where: { id: req.user.payerId } });
  if (!payer) throw new HttpError(403, 'Forbidden');
  const db = forOwner(payer.ownerId);
  const agreements = await db.$transaction(async (tx) => {
    const rows = await tx.agreement.findMany({ where: { payerId: payer.id }, orderBy: { id: 'asc' }, include: {
      unit: { include: { place: { include: { category: true } } } }, rateChanges: true,
      dues: { orderBy: { period: 'asc' } }, payments: { orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }] } } });
    const out = [];
    for (const a of rows) {
      if (a.status === 'ACTIVE') await syncAgreement(tx, a.id);
      const fresh = a.status === 'ACTIVE' ? await tx.recurringDue.findMany({ where: { agreementId: a.id }, orderBy: { period: 'asc' } }) : a.dues;
      const b = await agreementBalances(tx, a.id);
      const cat = a.unit.place.category;
      out.push({
        categoryName: cat.name, placeName: a.unit.place.name, unitName: a.unit.name,
        labels: { place: cat.placeLabel, unit: cat.unitLabel, payer: cat.payerLabel },
        amount: currentRate(a.rateChanges), dueDay: a.dueDay, status: a.status,
        startDate: toDateOnly(a.startDate), endDate: a.endDate ? toDateOnly(a.endDate) : null,
        dues: fresh.map((d) => ({ period: d.period, dueDate: toDateOnly(d.dueDate), amount: d.amount, paidAmount: d.paidAmount, status: d.status })),
        payments: a.payments.map((p) => ({ paymentDate: toDateOnly(p.paymentDate), amount: p.amount, method: p.method })),
        advanceHeld: b.advanceHeldPaise / 100, credit: b.creditPaise / 100, unpaid: b.unpaidPaise / 100,
      });
    }
    return out;
  }, { timeout: 30000 });
  res.json({ payer: { name: payer.name, phone: payer.phone }, agreements });
}

module.exports = { me };
