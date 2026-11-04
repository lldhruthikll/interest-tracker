// Read-only. Run: node scripts/local.js node scripts/anomaly-scan.js
// Exit 2 if duplicate (loanId, IST month) InterestRecords exist.
const prisma = require('../src/config/db');
const IST = (c) => `((("${c}"::timestamp) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date`;
const MONEY = [['Loan', 'principal'], ['Loan', 'monthlyInterest'], ['InterestRecord', 'amount'],
  ['InterestRecord', 'paidAmount'], ['Payment', 'amount'], ['PaymentAllocation', 'amount']];

(async () => {
  let dup = 0;
  const show = (title, rows) => { console.log(`\n== ${title}: ${rows.length}`); rows.forEach((r) => console.log(JSON.stringify(r))); };
  for (const [t, c] of [['InterestRecord', 'dueDate'], ['Loan', 'startDate']]) {
    show(`${t}.${c} with time-of-day != 00:00:00`, (await prisma.$queryRawUnsafe(
      `SELECT id, "${c}"::text AS value, ${IST(c)}::text AS ist_date FROM "${t}"
       WHERE "${c}"::timestamp <> date_trunc('day', "${c}"::timestamp) ORDER BY id`)));
  }
  const d = await prisma.$queryRawUnsafe(
    `SELECT "loanId", date_trunc('month', ${IST('dueDate')})::date::text AS ist_month, count(*)::int AS n,
            array_agg(id ORDER BY id) AS ids
     FROM "InterestRecord" GROUP BY 1, 2 HAVING count(*) > 1 ORDER BY 1, 2`);
  show('duplicate InterestRecord months (loanId, IST month)', d);
  dup = d.length;
  for (const [t, c] of MONEY) {
    show(`${t}.${c} with sub-paisa noise`, await prisma.$queryRawUnsafe(
      `SELECT id, "${c}"::text AS value FROM "${t}" WHERE "${c}"::numeric <> ROUND("${c}"::numeric, 2) ORDER BY id`));
  }
  console.log(`\nduplicates: ${dup ? 'YES' : 'no'}`);
  await prisma.$disconnect();
  process.exit(dup ? 2 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
