// Single choke point for per-owner isolation: every query on an owned model is pinned to ownerId.
// Not covered (callers must handle): $queryRaw/$executeRaw, nested writes in `data`, and relation
// includes (safe only because creates check parents with requireOwned, so links never cross owners).
const prisma = require('../config/db');
const { NotFound } = require('./errors');

const OWNED_MODELS = ['Borrower', 'Loan', 'InterestRecord', 'Payment', 'PaymentAllocation',
  'Category', 'Place', 'Unit', 'Payer', 'Agreement', 'RateChange', 'RecurringDue', 'RecurringPayment',
  'RecurringAllocation', 'AdvanceEntry', 'Creditor', 'DebtEntry'];

const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate',
  'groupBy', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);

const NO_REASSIGN = new Set(['update', 'updateMany', 'upsert']);

function forOwner(ownerId) {
  return prisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!OWNED_MODELS.includes(model)) return query(args);
          args = { ...args };
          if (NO_REASSIGN.has(operation)) {
            const d = operation === 'upsert' ? args.update : args.data;
            if (d && 'ownerId' in d) throw new Error(`ownerDb: cannot change ownerId (${model}.${operation})`);
          }
          if (WHERE_OPS.has(operation)) args.where = { ...args.where, ownerId };
          if (operation === 'upsert') args.create = { ...args.create, ownerId };
          if (operation === 'create') args.data = { ...args.data, ownerId };
          else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            args.data = [].concat(args.data).map((row) => ({ ...row, ownerId }));
          } else if (!WHERE_OPS.has(operation)) {
            throw new Error(`ownerDb: unscoped operation ${model}.${operation}`); // fail closed
          }
          return query(args);
        },
      },
    },
  });
}

// model is the client key ('borrower', 'loan', ...). Throws 404 unless the row belongs to db's owner.
async function requireOwned(db, model, id) {
  const row = await db[model].findUnique({ where: { id } });
  if (!row) throw new NotFound(`${model[0].toUpperCase()}${model.slice(1)} not found`);
  return row;
}

module.exports = { OWNED_MODELS, forOwner, requireOwned };
