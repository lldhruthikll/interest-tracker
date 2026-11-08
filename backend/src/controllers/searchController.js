// Sidebar search: tenants/regulars (by name, phone or unit) and borrowers (by name or phone), owner-scoped.
const MIN = 2;

async function search(req, res) {
  const q = String(req.query.q ?? '').trim().slice(0, 50);
  if (q.length < MIN) return res.json({ tenants: [], borrowers: [] });
  const like = { contains: q, mode: 'insensitive' };
  const agreements = await req.db.agreement.findMany({
    where: { OR: [{ payer: { name: like } }, { payer: { phone: { contains: q } } }, { unit: { name: like } }] },
    include: { payer: true, unit: { include: { place: { include: { category: true } } } } },
    orderBy: [{ status: 'asc' }, { id: 'desc' }], // ACTIVE before ENDED, newest first
    take: 20,
  });
  const borrowers = await req.db.borrower.findMany({
    where: { OR: [{ name: like }, { phone: { contains: q } }] }, orderBy: { name: 'asc' }, take: 10 });
  res.json({
    tenants: agreements.map((a) => ({ agreementId: a.id, name: a.payer.name, phone: a.payer.phone, unit: a.unit.name,
      category: a.unit.place.category.name, status: a.status })),
    borrowers: borrowers.map((b) => ({ id: b.id, name: b.name, phone: b.phone })),
  });
}

module.exports = { search };
