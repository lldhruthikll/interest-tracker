// Read-only. Run: node scripts/local.js node scripts/migration-snapshot.js > snapshot.json
const prisma = require('../src/config/db');
const T = ['User', 'Borrower', 'Loan', 'InterestRecord', 'Payment', 'PaymentAllocation'];
const S = { principal: ['Loan', 'principal'], monthlyInterest: ['Loan', 'monthlyInterest'],
  interestAmount: ['InterestRecord', 'amount'], interestPaid: ['InterestRecord', 'paidAmount'],
  paymentAmount: ['Payment', 'amount'], allocationAmount: ['PaymentAllocation', 'amount'] };

(async () => {
  const out = { counts: {}, sums: {} };
  for (const t of T) out.counts[t] = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`))[0].n;
  for (const [k, [t, c]] of Object.entries(S))
    out.sums[k] = (await prisma.$queryRawUnsafe(
      `SELECT ROUND(COALESCE(SUM("${c}"),0)::numeric, 2)::text AS s FROM "${t}"`))[0].s;
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
