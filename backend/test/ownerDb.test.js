const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/db');
const { forOwner } = require('../src/lib/ownerDb');

test.after(() => prisma.$disconnect());

test('owned-model writes cannot reassign ownerId', async () => {
  const db = forOwner(1);
  const data = { ownerId: 2 };
  await assert.rejects(() => db.borrower.update({ where: { id: 1 }, data }), /ownerDb: cannot change ownerId/);
  await assert.rejects(() => db.borrower.updateMany({ data }), /ownerDb: cannot change ownerId/);
  await assert.rejects(() => db.borrower.upsert({ where: { id: 1 }, create: { name: 'x', phone: '1' }, update: data }), /ownerDb: cannot change ownerId/);
});
