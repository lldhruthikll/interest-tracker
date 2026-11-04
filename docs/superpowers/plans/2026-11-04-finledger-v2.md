# FinLedger v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-user lending tracker into a multi-account ledger app (lending + generic recurring-income categories + read-only payer portal) with a neumorphism/clay UI, built and tested only against a local database.

**Architecture:** Express + Prisma backend gains (1) a per-request owner-scoped Prisma client so every owned query is filtered by `ownerId` in one place, (2) a pure schedule/allocation engine for recurring income with DB sync on read, (3) role-based auth (ADMIN / MEMBER / PAYER). React frontend gets a new design system (Tailwind tokens + `neu`/`neu-in`/`clay` classes) and new pages. Existing data moves via a hand-written Prisma migration verified by before/after totals.

**Tech Stack:** Node 20, Express 4, Prisma 5 (PostgreSQL), `node:test`, React 18, Vite 5, Tailwind 3, lucide-react, xlsx. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-finledger-v2-design.md` (read it first; this plan argues from it).

## Global Constraints

- Nothing local may connect to Neon or Render, except Task 2's single read-only `pg_dump`. Never print, copy, or edit `backend/.env` or `frontend/.env`.
- Do not `git push`. Commits go on `feat/finledger-v2`. Commit messages carry no `Co-Authored-By` trailer (user's global rule).
- Every Prisma CLI command and every backend run/test goes through `backend/scripts/local.js` (Task 1), never bare `npx prisma ...` (Prisma CLI auto-loads `backend/.env`, which points at the live DB).
- Money columns: `Decimal(12,2)`. Writes, comparisons and allocation math use integer paise via `src/lib/money.js`. Read-only aggregates may sum `Number()` values and round once at the end (`// ponytail:` comment where done).
- Calendar dates (`dueDate`, `startDate`, `endDate`, recurring `paymentDate`, advance `date`) are `@db.Date` and handled in code as `'YYYY-MM-DD'` strings. Business timezone `Asia/Kolkata`; "today" = `todayIST()`.
- Periods are calendar months as `'YYYY-MM'` strings.
- Status words are always shown as text, never color alone. Indian grouping: `₹1,42,000`.
- Visual tokens from spec §9 verbatim: base `#e8ebf1`; raised `8px 8px 16px #c8ccd4, -8px -8px 16px #ffffff`; inset `inset 5px 5px 10px #c8ccd4, inset -5px -5px 10px #ffffff`; clay paid `#c9f2dc`/`#14532d`, partial `#ffeab5`/`#7a4a04`, overdue `#ffd9d6`/`#8f1d1d`, advance `#dcd6ff`/`#3b2f80`; accent `#7c6cf2`; font Nunito 600–900; radii 16–28px.
- Tests: `node:test` + `node:assert/strict`, run with `--test-concurrency=1` against the local test DB `finledger_test`.

## Review Focus

1. **Cross-owner linking by ID in a create body** (e.g. user B posts a loan with user A's `borrowerId`, or an agreement with A's `unitId`/`payerId`): must 404, not create a cross-owner row. Test in Task 5 (lending) and Task 8 (recurring).
2. **Raw SQL bypasses the owner scope** (`getMonthlyAnalytics` uses `$queryRaw`): must filter `"ownerId"` explicitly. Test in Task 5: user B's analytics trend is all zeros when only A has data.
3. **Payment dated before move-in or after a settled move-out, or amount `0`/negative/non-numeric/over 2 decimals**: reject with 400. Test in Task 7.
4. **Second active agreement on an occupied unit** (double-click on "Move in"): DB rejects via partial unique index; API returns 409. Test in Task 8.
5. **A PAYER whose login is disabled or whose token predates disabling**: every request returns 401. Test in Task 4.

---

## File Structure

Backend (`backend/`):
- `scripts/local.js`: loads `.env.local` (or `.env.test` with `--test`), runs the DB-URL guard, spawns the given command. The only way to run Prisma/node locally.
- `scripts/anomaly-scan.js`, `scripts/migration-snapshot.js`: read-only checks for Task 2/3.
- `scripts/create-admin.js`: bootstrap first ADMIN on an empty DB.
- `prisma/schema.prisma`, `prisma/migrations/0_init/`, `prisma/migrations/1_v2_accounts/`, `prisma/migrations/2_recurring/`.
- `src/app.js` (Express app, exported), `src/index.js` (listen only).
- `src/lib/money.js`, `src/lib/dates.js`, `src/lib/dbGuard.js`, `src/lib/ownerDb.js`, `src/lib/errors.js`.
- `src/services/interestService.js` (lending, adapted), `src/services/allocation.js` (shared FIFO planner), `src/services/schedule.js` (pure recurring schedule), `src/services/recurringSync.js` (DB sync + reallocation).
- `src/middleware/auth.js` (rewritten), `src/routes/api.js`, `src/routes/portal.js`.
- Controllers: existing lending ones adapted; new `adminController.js`, `categoryController.js`, `payerController.js`, `agreementController.js`, `recurringPaymentController.js`, `overviewController.js`, `portalController.js`; `reportController.js` extended.
- `test/helpers.js` (reset DB, make users, HTTP helper), `test/*.test.js`.

Frontend (`frontend/src/`):
- `index.css` (component classes), `tailwind.config.js` (tokens), `index.html` (Nunito font).
- `lib/format.js` (`formatINR`, `formatDate`, `periodLabel`).
- `components/ui.jsx` (Button, Card, StatCard, Pill, Chips, Modal, Field, Table, EmptyState).
- `components/AppShell.jsx` (sidebar + mobile drawer), `components/PortalShell.jsx`.
- `pages/auth/`, `pages/overview/`, `pages/lending/` (moved existing pages), `pages/category/`, `pages/payers/`, `pages/settings/`, `pages/portal/`, `pages/CalendarPage.jsx`.

---

### Task 1: Local-only environment, DB guard, test harness

**Files:**
- Create: `backend/scripts/local.js`, `backend/src/lib/dbGuard.js`, `backend/src/app.js`, `backend/.env.local.example`, `backend/.env.test.example`, `backend/test/helpers.js`, `backend/test/dbGuard.test.js`, `frontend/.env.development.local` (gitignored via `*.local`)
- Modify: `backend/src/index.js` (listen only), `backend/package.json` scripts, `.gitignore` (add `.env.local`, `.env.test`, `*.local`), move `backend/src/tests/fifoTest.js` → delete after Task 3 ports it.

**Interfaces:**
- Produces: `assertSafeDatabaseUrl(url: string, nodeEnv: string): void` (throws `Error('Refusing non-local DATABASE_URL outside production')`); `createApp(): express.Application` from `src/app.js`; npm scripts `dev`, `test`, `db:migrate`, `db:status`, `db:studio` all via `node scripts/local.js`.
- `test/helpers.js` produces: `resetDb(): Promise<void>` (TRUNCATE all tables RESTART IDENTITY CASCADE), `startServer(): Promise<{url, close}>` (listens on port 0), `api(url, path, {method, token, body}) → {status, body}` using global `fetch`.

- [ ] **Step 1: Write the failing test** `test/dbGuard.test.js`

```js
test('allows local hosts', () => {
  for (const h of ['localhost', '127.0.0.1', 'postgres'])
    assert.doesNotThrow(() => assertSafeDatabaseUrl(`postgresql://u:p@${h}:5433/db`, 'development'));
});
test('rejects neon outside production', () => {
  assert.throws(() => assertSafeDatabaseUrl('postgresql://u:p@ep-x.neon.tech/db?sslmode=require', 'development'), /non-local/);
  assert.throws(() => assertSafeDatabaseUrl('postgresql://u:p@ep-x.neon.tech/db', undefined), /non-local/);
});
test('production skips the check', () => {
  assert.doesNotThrow(() => assertSafeDatabaseUrl('postgresql://u:p@ep-x.neon.tech/db', 'production'));
});
```

- [ ] **Step 2: Run** `node --test test/dbGuard.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement `assertSafeDatabaseUrl`** with `new URL(url).hostname` checked against `['localhost','127.0.0.1','postgres']`. Call it at top of `src/index.js` and inside `scripts/local.js` before spawning.
- [ ] **Step 4: Implement `scripts/local.js`**: `node scripts/local.js [--test] <cmd> [...args]` → parse `.env.local` / `.env.test` with `dotenv.parse` (already a dependency), set `process.env` **overriding** any existing `DATABASE_URL`, set `NODE_ENV` to `development`/`test`, guard, `spawnSync(cmd, args, {stdio:'inherit', env})`, exit with child's code. Scripts: `"dev": "node scripts/local.js node --watch src/index.js"`, `"test": "node scripts/local.js --test node --test --test-concurrency=1 test/"`, `"db:migrate": "node scripts/local.js npx prisma migrate dev"`, `"db:test:reset": "node scripts/local.js --test npx prisma migrate reset --force --skip-seed"`, `"db:status": "node scripts/local.js npx prisma migrate status"`. Change `"start"` to `"node src/index.js"` (no `db push`; spec §10).
- [ ] **Step 5: Split app.** `src/app.js` exports `createApp()` (current middleware/routes; CORS origin from `CORS_ORIGIN` env, comma-separated; default `http://localhost:5173`). `src/index.js` guards, then `createApp().listen(PORT)`.
- [ ] **Step 6: Local DB.** `docker compose up -d postgres`; create databases `finledger_v2` and `finledger_test` (`docker exec interest_db psql -U postgres -c 'CREATE DATABASE ...'`). Write `.env.local` (`DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5433/finledger_v2`, `JWT_SECRET=<random 48 bytes hex>`, `CORS_ORIGIN=http://localhost:5173`) and `.env.test` (same with `finledger_test`). Frontend `.env.development.local`: `VITE_API_URL=http://localhost:5000/api` (Vite gives `.env.development.local` priority over `.env` in dev).
- [ ] **Step 7: Verify** `cd backend && npm run db:status` prints `localhost:5433` and not neon; `npm test` → dbGuard tests PASS. Temporarily run `DATABASE_URL=postgresql://u:p@x.neon.tech/db node -e "require('./src/lib/dbGuard').assertSafeDatabaseUrl(process.env.DATABASE_URL, 'development')"` → throws.
- [ ] **Step 8: Commit** `chore: local-only env, DB guard, test harness`.

---

### Task 2: Read-only copy of live data + anomaly scan

**Files:**
- Create: `backend/scripts/anomaly-scan.js`, `backend/scripts/migration-snapshot.js`

**Interfaces:**
- Produces: `migration-snapshot.js` writes JSON to stdout: `{counts:{User,Borrower,Loan,InterestRecord,Payment,PaymentAllocation}, sums:{principal, monthlyInterest, interestAmount, interestPaid, paymentAmount, allocationAmount}}` with sums as strings rounded to 2 decimals via SQL `ROUND(SUM(x)::numeric, 2)`. Works on both old (float) and new (decimal) schemas because it uses raw SQL.

- [ ] **Step 1: Dump live DB (the one allowed contact).** In a subshell, read the URL from `backend/.env` without echoing: `( set -a; . backend/.env; set +a; docker run --rm --network host postgres:17-alpine pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl ) > $SCRATCH/live.dump`. Check the file is non-empty. If the server version is newer than 17, retry with the matching image tag.
- [ ] **Step 2: Restore into `finledger_v2`:** `docker run --rm --network host -v $SCRATCH:/d postgres:17-alpine pg_restore --no-owner --no-acl -d postgresql://postgres:postgrespassword@localhost:5433/finledger_v2 /d/live.dump`. Verify `docker exec interest_db psql -U postgres -d finledger_v2 -c 'select count(*) from "Loan"'` returns a number.
- [ ] **Step 3: Implement `anomaly-scan.js`** (read-only, via `scripts/local.js`). Reports:
  - InterestRecord/Loan dates whose time-of-day ≠ 00:00:00 (list id + value + IST date it maps to: `(("x" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date`).
  - Duplicate months: `GROUP BY "loanId", ist_date_trunc_month HAVING count(*) > 1`.
  - Money with sub-paisa noise: `WHERE x::numeric <> ROUND(x::numeric, 2)` per money column.
  - Exit code 2 if duplicates exist, else 0.
- [ ] **Step 4: Implement `migration-snapshot.js`** as specified in Interfaces; save `$SCRATCH/snapshot-before.json`.
- [ ] **Step 5: Run both; show the owner the anomaly report.** **If duplicates exist, stop and ask the owner** (spec §12). Otherwise continue.
- [ ] **Step 6: Commit** the two scripts: `chore: read-only anomaly scan and migration snapshot`.

---

### Task 3: Schema v2 (accounts + decimal + dates) with verified migration; lending adapted

**Files:**
- Modify: `backend/prisma/schema.prisma`, `src/services/interestService.js`, `src/controllers/{borrower,loan,payment,dashboard,report}Controller.js`
- Create: `prisma/migrations/0_init/migration.sql`, `prisma/migrations/1_v2_accounts/migration.sql`, `src/lib/money.js`, `src/lib/dates.js`, `src/services/allocation.js`, `test/money.test.js`, `test/dates.test.js`, `test/allocation.test.js`, `test/lending.test.js`
- Delete: `src/tests/fifoTest.js` (ported into `test/lending.test.js`)

**Interfaces:**
- `money.js`: `toPaise(v: Decimal|number|string): number` (rounds half-up to integer paise; throws on NaN), `fromPaise(p: number): string` (`'1234.50'`), `parseAmountPaise(input): number` (for API input: positive, ≤ 2 decimals, else throws `ValidationError`). Also once at load: `Prisma.Decimal.prototype.toJSON = function () { return this.toNumber(); }` so API JSON keeps numbers.
- `dates.js`: `todayIST(now = new Date()): 'YYYY-MM-DD'`, `addDays(d, n)`, `toDateOnly(d: Date): 'YYYY-MM-DD'` (from a `@db.Date` value, UTC parts), `toDbDate(s): Date` (UTC midnight), `periodOf(d) 'YYYY-MM'`, `addMonths(period, n)`, `daysInMonth(period)`, `clampDay(period, day): 'YYYY-MM-DD'`, `isValidDateStr(s)`.
- `allocation.js`: `planFifo(dues: Array<{id, amountPaise, paidPaise}>, amountPaise: number): {allocations: Array<{dueId, amountPaise}>, leftoverPaise: number}`. `dues` must already be sorted oldest first.
- Schema: `User { role String @default("MEMBER"), active Boolean @default(true), mustChangePassword Boolean @default(false), payerId Int? @unique }`; `ownerId Int` + relation to `User` on `Borrower, Loan, InterestRecord, Payment, PaymentAllocation` with `@@index([ownerId])`; all money `Decimal @db.Decimal(12,2)`; `Loan.startDate`, `InterestRecord.dueDate` → `@db.Date`. `Payment.paymentDate` stays a timestamp.

- [ ] **Step 1: Failing unit tests.**

```js
// money.test.js
assert.equal(toPaise('1234.5'), 123450); assert.equal(toPaise(999.9999), 100000);
assert.equal(fromPaise(123450), '1234.50');
assert.throws(() => parseAmountPaise('0')); assert.throws(() => parseAmountPaise('-5'));
assert.throws(() => parseAmountPaise('10.123')); assert.throws(() => parseAmountPaise('abc'));
assert.equal(parseAmountPaise('25000'), 2500000);
// dates.test.js
assert.equal(todayIST(new Date('2026-11-03T19:00:00Z')), '2026-11-04'); // 00:30 IST
assert.equal(todayIST(new Date('2026-11-04T18:29:00Z')), '2026-11-04');
assert.equal(clampDay('2027-02', 31), '2027-02-28'); assert.equal(clampDay('2028-02', 30), '2028-02-29');
assert.equal(addMonths('2026-12', 1), '2027-01'); assert.equal(daysInMonth('2026-03'), 31);
// allocation.test.js
const r = planFifo([{id:1,amountPaise:1000,paidPaise:400},{id:2,amountPaise:1000,paidPaise:0}], 1500);
assert.deepEqual(r, {allocations:[{dueId:1,amountPaise:600},{dueId:2,amountPaise:900}], leftoverPaise:0});
assert.equal(planFifo([], 500).leftoverPaise, 500);
```

- [ ] **Step 2: Run** `npm test` → FAIL. **Step 3: Implement** the three libs. **Step 4: Run** → PASS.
- [ ] **Step 5: Baseline migration.** Write `0_init/migration.sql` = `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` run on the **current (pre-change)** schema (through `local.js`). Mark it applied on the copy: `node scripts/local.js npx prisma migrate resolve --applied 0_init`.
- [ ] **Step 6: Edit schema to v2 shape** (Interfaces above), then generate `1_v2_accounts` with `node scripts/local.js npx prisma migrate dev --create-only --name v2_accounts` and **hand-edit** the SQL so it preserves data:
  - Add `ownerId` columns nullable → `UPDATE ... SET "ownerId" = (SELECT id FROM "User" ORDER BY id LIMIT 1)` → `SET NOT NULL` → FKs/indexes. Existing user: `UPDATE "User" SET role='ADMIN'`.
  - Money: `ALTER COLUMN x TYPE DECIMAL(12,2) USING ROUND(x::numeric, 2)`.
  - Dates: `ALTER COLUMN "dueDate" TYPE DATE USING (("dueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date`; same for `Loan.startDate`.
  - Keep `@@unique([loanId, dueDate])`.
- [ ] **Step 7: Apply and verify on the copy.** `npm run db:migrate` (applies `1_v2_accounts`), then `migration-snapshot.js > $SCRATCH/snapshot-after.json`; `diff` before/after → **must be identical** (counts and sums). If sub-paisa rows existed (Task 2), the only allowed diff is ≤ 0.005 × row-count in the affected sum; report it to the owner.
- [ ] **Step 8: Failing lending test** `test/lending.test.js` (DB, uses `resetDb`): port `fifoTest` (start `2026-03-15`, target `2026-06-20` → dues `2026-04-15, 2026-05-15, 2026-06-15`); start `2026-01-31` → `2026-02-28, 2026-03-31`; payment 1500 against two ₹1000 dues (one already 400 paid) → statuses `PAID`, `PARTIALLY_PAID`, paid 1000/900; payment delete restores previous paid amounts.
- [ ] **Step 9: Adapt lending code** to date strings (`getDueDatesForLoan(startDateStr, targetDateStr): string[]`), `planFifo` + paise for all writes in `allocatePaymentFIFO`, `updatePayment`, `reversePaymentAllocations`, `clearInterestRecord`; read aggregates use `Number()`; `todayIST()` replaces every `new Date()`-as-today in dashboard/borrower controllers (next-due calc included). Lending behavior otherwise unchanged; analytics stay grouped by due month (spec §7). All queries still use global `prisma` here; Task 5 scopes them.
- [ ] **Step 10: Run** `npm test` → PASS. Start backend (`npm run dev`) with `frontend` on the old UI pointed at local API, log in as the existing user, spot-check one borrower's numbers against the live site (read-only look in the browser) → identical.
- [ ] **Step 11: Commit** `feat: v2 schema (owners, decimals, date-only) with verified data migration`.

---

### Task 4: Auth, roles, accounts administration

**Files:**
- Modify: `src/middleware/auth.js`, `src/controllers/authController.js`, `src/routes/api.js`
- Create: `src/controllers/adminController.js`, `src/lib/errors.js`, `scripts/create-admin.js`, `test/auth.test.js`

**Interfaces:**
- `auth.js` produces: `authenticate` (verifies JWT, loads user by id; 401 if missing/`active=false`; sets `req.user = {id, role, payerId, mustChangePassword}`), `requireRole(...roles)`, `requirePasswordChanged` (403 `{error:'PASSWORD_CHANGE_REQUIRED'}` when flag set). JWT payload `{userId}`; `JWT_SECRET` required at startup (throw if unset); expiry 30d.
- `errors.js`: `class HttpError(status, message)`, `ValidationError extends HttpError(400)`, `NotFound` (404); app error handler maps `HttpError` → status, Prisma `P2025` → 404, `P2002` → 409.
- Routes: `POST /auth/login` → `{token, user:{id, username, name, role, mustChangePassword}}`; `POST /auth/change-password {currentPassword, newPassword}` (min 8 chars; clears flag); `GET /auth/profile`; ADMIN: `GET /admin/members`, `POST /admin/members {username, name, password}` (role MEMBER, `mustChangePassword:true`), `PUT /admin/members/:id {password?, active?}` (target must be MEMBER).
- `scripts/create-admin.js --username U --password P --name N`: creates ADMIN only if none exists.

- [ ] **Step 1: Failing tests** `test/auth.test.js`: login wrong password → 401; 11th failed attempt for same username within 15 min → 429; no `admin/admin123` auto-creation on empty DB (→ 401); new member must change password (owner route → 403 `PASSWORD_CHANGE_REQUIRED`; after change → 200); MEMBER calling `/admin/members` → 403; ADMIN disables member → member's existing token → 401; **disabled PAYER token → 401** (Review Focus 5; create PAYER user directly in DB here).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Login limiter: in-memory `Map` keyed `username|ip`, 10 failures / 15 min, reset on success (`// ponytail: in-memory limiter, per-process; move to DB/redis if multiple instances`). Remove auto-admin block. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: roles, required JWT secret, login limiter, family accounts admin`.

---

### Task 5: Owner scoping for lending

**Files:**
- Create: `src/lib/ownerDb.js`, `test/isolation.lending.test.js`
- Modify: `src/routes/api.js`, all lending controllers

**Interfaces:**
- `ownerDb.js`: `OWNED_MODELS` (string list; Task 6 appends recurring models), `forOwner(ownerId: number): PrismaClient` via `prisma.$extends({ query: { $allModels: { $allOperations } } })` that, for models in `OWNED_MODELS`: adds `ownerId` to `where` on `findUnique/findUniqueOrThrow/findFirst/findFirstOrThrow/findMany/count/aggregate/groupBy/update/updateMany/delete/deleteMany/upsert`; sets `data.ownerId` on `create`/`upsert.create`; maps `createMany` rows. `requireOwned(db, model, id): Promise<row>` → 404 if not found.
- Middleware `ownerScope` (after `authenticate`, `requireRole('ADMIN','MEMBER')`, `requirePasswordChanged`) sets `req.db = forOwner(req.user.id)`. Controllers use `req.db` exclusively; `interestService` functions take `db` as first argument.
- Raw SQL in `getMonthlyAnalytics` adds `WHERE "ownerId" = ${req.user.id}`.

- [ ] **Step 1: Failing tests** with users A and B (both MEMBER, flag cleared): A creates borrower+loan+payment; B gets 404 for `GET/PUT/DELETE /borrowers/:aId`, `PUT /loans/:aLoan`, `PUT/DELETE /payments/:aPay`, `PUT /interest-records/:id/clear`; B's `GET /borrowers` is `[]`; B's `/dashboard` totals 0; **B posts `/loans` with A's `borrowerId` → 404 and no row created** (Review Focus 1); **B's `/analytics/monthly` trend all zeros** (Review Focus 2); a `$transaction` on `forOwner(B)` cannot read A's rows (proves extension applies inside interactive transactions).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; every create that references a parent calls `requireOwned` on it first. **Step 4: Run** full suite → PASS (lending tests now pass `forOwner(user)`).
- [ ] **Step 5: Commit** `feat: per-owner data isolation for lending`.

---

### Task 6: Recurring schema + pure schedule engine

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/ownerDb.js` (`OWNED_MODELS` += new models)
- Create: migration `2_recurring` (via `--create-only`, then append the partial unique index), `src/services/schedule.js`, `test/schedule.test.js`

**Interfaces:**
- Models (all with `ownerId` + `@@index([ownerId])`): `Category {name, placeLabel, unitLabel, payerLabel, color String?, archived Boolean @default(false)}`; `Place {categoryId, name, address?, archived}`; `Unit {placeId, name, defaultAmount Decimal(12,2), notes?, archived}`; `Payer {name, phone, notes?}` (User.payerId → Payer); `Agreement {unitId, payerId, startDate @db.Date, endDate @db.Date?, dueDay Int, timing String /*IN_ADVANCE|IN_ARREARS*/, firstMonthRule String /*PRORATED|FULL|FREE*/, lastMonthRule String, status String /*ACTIVE|ENDED*/ @default("ACTIVE"), notes?}`; `RateChange {agreementId, amount Decimal, effectiveFrom String /*YYYY-MM*/, @@unique([agreementId, effectiveFrom])}`; `RecurringDue {agreementId, period String, dueDate @db.Date, amount Decimal, paidAmount Decimal @default(0), status String @default("PENDING"), @@unique([agreementId, period])}`; `RecurringPayment {agreementId, amount Decimal, paymentDate @db.Date, method String /*CASH|UPI|BANK|CHEQUE|ADVANCE*/, notes?}`; `RecurringAllocation {paymentId (onDelete Cascade), dueId (onDelete Cascade), amount Decimal}`; `AdvanceEntry {agreementId, type String /*RECEIVED|APPLIED_TO_RENT|RETAINED|REFUNDED|CREDIT_REFUNDED*/, amount Decimal, date @db.Date, notes?, paymentId Int? (onDelete Cascade)}`.
- Migration extra SQL: `CREATE UNIQUE INDEX "Agreement_one_active_per_unit" ON "Agreement"("unitId") WHERE status = 'ACTIVE';`
- `schedule.js`: `buildSchedule(a: {startDate, endDate|null, dueDay, timing, firstMonthRule, lastMonthRule, rates: Array<{effectiveFrom, amountPaise}>}, untilDate: 'YYYY-MM-DD'|null): Array<{period, dueDate, amountPaise}>` — includes every period whose `dueDate <= untilDate` (`null` = all periods through end; throws if both `endDate` and `untilDate` are null).

Algorithm rules (decided here; not derivable from the signature):
- Periods run from `periodOf(startDate)` to `periodOf(endDate)` (or unbounded).
- Due date: `IN_ADVANCE` → `clampDay(period, dueDay)`, but for the start period use `max(that, startDate)`. `IN_ARREARS` → `clampDay(addMonths(period,1), dueDay)`.
- Base amount: latest rate with `effectiveFrom <= period`; no rate → skip period.
- First period partial if start day ≠ 1; last period partial if `endDate` ≠ month's last day. Occupied days: start→month end, month start→end, or start→end when both in one period.
- Partial rule: first period uses `firstMonthRule`, last uses `lastMonthRule`; same-period start+end uses `firstMonthRule`. `FREE` → no due; `FULL` → base; `PRORATED` → `Math.round(base * days / daysInMonth(period))`.

- [ ] **Step 1: Failing tests** `test/schedule.test.js`:

```js
const base = {dueDay:5, timing:'IN_ADVANCE', firstMonthRule:'PRORATED', lastMonthRule:'PRORATED', endDate:null,
  rates:[{effectiveFrom:'2026-03', amountPaise:3100000}], startDate:'2026-03-25'};
// spec §7 example
assert.deepEqual(buildSchedule(base, '2026-04-05'), [
  {period:'2026-03', dueDate:'2026-03-25', amountPaise:700000},
  {period:'2026-04', dueDate:'2026-04-05', amountPaise:3100000}]);
assert.deepEqual(buildSchedule({...base, timing:'IN_ARREARS'}, '2026-05-05').map(d=>[d.period,d.dueDate,d.amountPaise]),
  [['2026-03','2026-04-05',700000],['2026-04','2026-05-05',3100000]]);
assert.equal(buildSchedule({...base, firstMonthRule:'FULL'}, '2026-03-31')[0].amountPaise, 3100000);
assert.equal(buildSchedule({...base, firstMonthRule:'FREE'}, '2026-04-05')[0].period, '2026-04');
// due day 31 in Feb, start on the 1st (not partial)
assert.equal(buildSchedule({...base, startDate:'2027-01-01', dueDay:31, rates:[{effectiveFrom:'2027-01',amountPaise:100000}]}, '2027-03-01')[1].dueDate, '2027-02-28');
// rate change from June
const rc = buildSchedule({...base, startDate:'2026-04-01', rates:[{effectiveFrom:'2026-04',amountPaise:100000},{effectiveFrom:'2026-06',amountPaise:120000}]}, '2026-07-05');
assert.deepEqual(rc.map(d=>d.amountPaise), [100000,100000,120000,120000]);
// move-out Jun 10, prorated (30-day month), all periods through end
const mo = buildSchedule({...base, startDate:'2026-04-01', endDate:'2026-06-10', rates:[{effectiveFrom:'2026-04',amountPaise:300000}]}, null);
assert.deepEqual(mo.map(d=>d.amountPaise), [300000,300000,100000]);
assert.equal(buildSchedule({...base, startDate:'2026-04-01', endDate:'2026-06-10', lastMonthRule:'FULL', rates:[{effectiveFrom:'2026-04',amountPaise:300000}]}, null)[2].amountPaise, 300000);
assert.equal(buildSchedule({...base, startDate:'2026-04-01', endDate:'2026-06-10', lastMonthRule:'FREE', rates:[{effectiveFrom:'2026-04',amountPaise:300000}]}, null).length, 2);
// same-month start and end: Mar 10–19 (10 days of 31), prorated
assert.equal(buildSchedule({...base, startDate:'2026-03-10', endDate:'2026-03-19'}, null)[0].amountPaise, 1000000);
assert.throws(() => buildSchedule(base, null));
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `buildSchedule`; write and apply migration `2_recurring`** (`npm run db:migrate`, `npm run db:test:reset`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: recurring-income schema and schedule engine`.

---

### Task 7: Recurring sync, reallocation, payments

**Files:**
- Create: `src/services/recurringSync.js`, `src/controllers/recurringPaymentController.js`, `test/recurring.payments.test.js`

**Interfaces:**
- `recurringSync.js`:
  - `syncAgreement(db, agreementId, {until = todayIST(), materializeAll = false}): Promise<void>` — loads agreement + rates; `buildSchedule(..., materializeAll ? null : until)`; creates missing dues; for existing dues with `paidAmount = 0` whose expected amount differs, updates amount (spec: never change collected money); if `status = 'ENDED'`, deletes dues whose period is after the schedule's last period; then `reallocate`.
  - `reallocate(db, agreementId): Promise<void>` — deletes the agreement's allocations, then walks payments ordered `(paymentDate, id)` and `planFifo` over dues ordered `(dueDate, id)`; writes allocations, `paidAmount`, `status` (`PAID` when paid ≥ amount, `PARTIALLY_PAID` when > 0, else `PENDING`). Dues reduced below their paid total (move-out) get trimmed by this naturally; the excess becomes credit.
  - `agreementBalances(db, agreementId): Promise<{duePaise, unpaidPaise, overduePaise, creditPaise, advanceHeldPaise}>` — `creditPaise = Σpayments − Σallocations − ΣCREDIT_REFUNDED`; `advanceHeldPaise = RECEIVED − APPLIED_TO_RENT − RETAINED − REFUNDED`; overdue = unpaid on dues with `dueDate < todayIST()`.
  - `syncOwner(db): Promise<void>` — `syncAgreement` for every ACTIVE agreement (`// ponytail: sync-on-read; move to a daily job if slow`).
  - All run inside `db.$transaction` by callers.
- Routes: `POST /recurring-payments {agreementId, amount, paymentDate, method, notes}`; `PUT /recurring-payments/:id {amount?, paymentDate?, method?, notes?}`; `DELETE /recurring-payments/:id`. Each: validate, `requireOwned(Agreement)`, write, `syncAgreement`. Method `ADVANCE` is rejected here (only settlement creates it). Response includes `agreementBalances`.

- [ ] **Step 1: Failing tests** (DB): agreement Mar 25 example with `until='2026-06-05'` → 4 dues; pay ₹7,000 → March `PAID`; pay ₹40,000 → April `PAID`, May `PARTIALLY_PAID` 9,000; delete the ₹40,000 → April/May `PENDING`; edit the ₹7,000 to ₹5,000 → March `PARTIALLY_PAID`; overpay so all 4 dues paid + ₹5,000 left → `creditPaise = 500000`, then sync with `until='2026-07-05'` → July due shows ₹5,000 paid; rate change (insert RateChange `2026-07`) after July is partially paid → July amount unchanged, August uses new rate; **validation (Review Focus 3): amount `0`, `-1`, `'abc'`, `'10.123'` → 400; paymentDate before `startDate` → 400; paymentDate after `endDate` on an ENDED agreement → 400**.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: recurring dues sync, FIFO reallocation, payments API`.

---

### Task 8: Categories, places, units, payers, agreements, move-out/settlement

**Files:**
- Create: `src/controllers/categoryController.js`, `src/controllers/payerController.js`, `src/controllers/agreementController.js`, `test/recurring.api.test.js`, `test/isolation.recurring.test.js`
- Modify: `src/routes/api.js`

**Interfaces (all owner-scoped; responses use spec labels from the category):**
- Categories: `GET /categories` (non-archived; `?all=1` includes archived), `POST /categories {name, placeLabel, unitLabel, payerLabel, color?}`, `GET /categories/:id` (with places → units → active agreement + payer), `PUT /categories/:id {…, archived?}`, `DELETE /categories/:id` → 409 if it has places, else delete.
- Places/units: `POST /categories/:id/places {name, address?}`, `PUT /places/:id {name?, address?, archived?}`, `POST /places/:id/units {name, defaultAmount, notes?}`, `PUT /units/:id {name?, defaultAmount?, notes?, archived?}`. Archiving a unit with an active agreement → 409.
- Payers: `GET /payers?search=`, `POST /payers {name, phone, notes?}`, `GET /payers/:id` (agreements across categories + balances + `login: {username, active} | null`), `PUT /payers/:id`, `POST /payers/:id/login {username, password}` (creates PAYER user, `mustChangePassword:true`; 409 if username taken or payer already has login), `PUT /payers/:id/login {password?, active?}`.
- Agreements:
  - `POST /agreements/preview {startDate, dueDay, timing, firstMonthRule, amount}` → first two entries of `buildSchedule(..., null with endDate = startDate + 2 months)` as `{period, dueDate, amount}`.
  - `POST /agreements {unitId, payerId | newPayer:{name, phone}, startDate, dueDay (1–31), amount, timing, firstMonthRule, lastMonthRule, advanceAmount?, advanceDate?, notes?}` → creates Agreement + first RateChange (`effectiveFrom = periodOf(startDate)`) + optional AdvanceEntry RECEIVED; syncs. Partial-index violation → 409 (Review Focus 4).
  - `GET /agreements/:id` → agreement, unit/place/category, payer, rates, dues (asc), payments (desc, with allocations), advance entries, balances.
  - `PUT /agreements/:id/billing {dueDay?, timing?, firstMonthRule?, lastMonthRule?}` → update, sync.
  - `POST /agreements/:id/rates {amount, effectiveFrom 'YYYY-MM'}` → upsert RateChange, sync.
  - `POST /agreements/:id/advance {type: 'RECEIVED', amount, date, notes?}` (additional advance only).
  - `POST /agreements/:id/move-out/preview {endDate, lastMonthRule}` → runs the move-out in a transaction and **rolls it back**, returning `{dues, unpaidPaise, advanceHeldPaise, creditPaise}` (throw a sentinel error to roll back).
  - `POST /agreements/:id/move-out {endDate, lastMonthRule, applyAdvance: boolean, retained: {amount, notes}|null}` → single transaction: set endDate/lastMonthRule/status ENDED; `syncAgreement(materializeAll)`; if `applyAdvance`, create `RecurringPayment` method `ADVANCE` for `min(held, unpaid)` dated `endDate` + AdvanceEntry `APPLIED_TO_RENT` linked by `paymentId`; `reallocate`; RETAINED entry if given (400 if > remaining held); REFUNDED entry for the remaining held; CREDIT_REFUNDED for remaining credit. `endDate < startDate` → 400. Returns final balances.
- Unit status for dashboards: `unitStatus(unit) → 'VACANT'|'OVERDUE'|'DUE_TODAY'|'PARTIAL'|'PAID'|'UPCOMING'` (first match in that order: no active agreement; any unpaid due before today; unpaid due today; latest due partially paid; at least one due and all paid; no dues yet). Export from `recurringSync.js`.

- [ ] **Step 1: Failing tests** `recurring.api.test.js`: create category "Commercial Rent" (Building/Shop/Tenant) with places A/B and units; preview returns Mar 25 example values; move-in with advance ₹50,000 → `advanceHeldPaise 5000000`; second move-in on same unit → 409; billing change to IN_ARREARS recalculates unpaid dues only; move-out Jun 10 PRORATED with unpaid ₹1,000 due, applyAdvance, retained ₹2,000 → ADVANCE payment ₹1,000, refund ₹47,000, `advanceHeldPaise 0`, `creditPaise 0`, unit `VACANT`; move-out where tenant had paid full June in advance (₹3,000, prorated to ₹1,000) → credit ₹2,000 refunded as CREDIT_REFUNDED; delete category with places → 409.
  `isolation.recurring.test.js`: B gets 404 on A's category/place/unit/payer/agreement/payment (GET/PUT/DELETE/move-out); **B creates agreement using A's `unitId` or `payerId` → 404; B adds place to A's category → 404** (Review Focus 1); B's lists are empty.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: categories, units, payers, agreements, move-out settlement API`.

---

### Task 9: Dashboards, overview, calendar, exports; payer portal API

**Files:**
- Create: `src/controllers/overviewController.js`, `src/controllers/portalController.js`, `src/routes/portal.js`, `test/overview.test.js`, `test/portal.test.js`
- Modify: `src/controllers/categoryController.js` (dashboard), `src/controllers/reportController.js`, `src/routes/api.js`, `src/app.js`

**Interfaces:**
- `GET /categories/:id/dashboard?placeId=` → `{category, places:[{id,name}], stats:{dueThisMonth, collectedThisMonth, pending, overdue, advancesHeld, credit, occupied, totalUnits}, units:[{unitId, unitName, placeName, payer:{id,name}|null, agreementId|null, amount, status}]}`. "This month" = dues whose `period = periodOf(todayIST())`; `collectedThisMonth` = allocations whose payment date falls in the current IST month; `pending`/`overdue` = unpaid on dues with `dueDate <= today` / `< today`.
- `GET /overview?months=12` → `{month:'YYYY-MM', ledgers:[{key:'lending'|'category:<id>', name, received, pending, overdue}], totals:{received, pending, overdue}, owedBack:{advances, credit}, trend:[{period, byLedger:{[key]: received}}], upcoming:[…7 days], overdueList:[…]}`. Received basis = **payment date** for every ledger (spec §7): lending `PaymentAllocation` by `Payment.paymentDate` (IST), recurring allocations by `RecurringPayment.paymentDate`. Upcoming recurring dues come from `buildSchedule` (not persisted). Lending's own `/dashboard` and `/analytics/monthly` stay unchanged.
- `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&ledger=` → `[{date, ledgerKey, ledgerName, title, amount, paid, status, link}]` (lending records + persisted recurring dues + scheduled future recurring dues in range).
- `GET /categories/:id/export` → xlsx with sheets `Dues`, `Payments`, `Advances` (existing `xlsx` dep; same download pattern as `/reports/excel`).
- Portal (mounted at `/api/portal`, `authenticate` + `requireRole('PAYER')` + `requirePasswordChanged`): `GET /portal/me` → `{payer:{name, phone}, agreements:[{categoryName, placeName, unitName, labels, amount, dueDay, status, startDate, endDate, dues, payments, advanceHeld, credit, unpaid}]}` scoped by `req.user.payerId` and the payer's owner. No other portal routes. Owner routes return 403 for PAYER (`requireRole('ADMIN','MEMBER')` in `ownerScope`).

- [ ] **Step 1: Failing tests.** `overview.test.js`: lending payment ₹2,000 on `2026-11-03` + rent payment ₹7,000 on `2026-11-04` → `totals.received` 9000 for `2026-11`; advance RECEIVED ₹50,000 does **not** appear in `received`, appears in `owedBack.advances`; dashboard `placeId` filter only returns that place's units. `portal.test.js`: payer P1 (two agreements) sees exactly two; P2 sees only theirs; P1 token on `/api/borrowers`, `/api/categories`, `/api/payers` → 403; portal response contains no other payer's name (string search on JSON).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** full suite → PASS.
- [ ] **Step 5: Commit** `feat: category dashboard, overview, calendar, exports, payer portal API`.

---

### Task 10: Design system, app shell, auth screens

**Files:**
- Modify: `frontend/tailwind.config.js`, `frontend/src/index.css`, `frontend/index.html`, `frontend/src/App.jsx`, `frontend/src/context/AuthContext.jsx`, `frontend/src/api/client.js`
- Create: `frontend/src/lib/format.js`, `frontend/src/components/ui.jsx`, `frontend/src/components/AppShell.jsx`, `frontend/src/components/PortalShell.jsx`, `frontend/src/pages/auth/LoginPage.jsx` (replaces old), `frontend/src/pages/auth/ChangePasswordPage.jsx`
- Delete: `components/Navbar.jsx`, `components/Sidebar.jsx`, `components/StatCard.jsx` (replaced)

**Interfaces:**
- Tailwind `theme.extend`: `colors.base '#e8ebf1'`, `colors.ink '#1f2937'`, `colors.muted '#5b6472'` (AA on base), `colors.accent '#7c6cf2'`, `colors.clay.{paid,partial,overdue,advance}` + matching `-ink`; `boxShadow.neu`, `boxShadow['neu-in']`; `fontFamily.sans ['Nunito', …]`; `borderRadius.{xl2:'20px', xl3:'28px'}`.
- `index.css` `@layer components`: `.neu`, `.neu-in`, `.clay` (pastel bg via modifier class + `inset -6px -6px 12px rgba(0,0,0,.07), inset 6px 6px 12px rgba(255,255,255,.75)` + raised drop), `.btn-primary`, `.btn`, `.field`, `.pill`.
- `ui.jsx` exports: `Button({variant:'primary'|'neu', …})`, `Card`, `InsetCard`, `StatCard({label, value, note, tone:'paid'|'partial'|'overdue'|'advance'|'neutral'})`, `StatusPill({status})` (maps every status from Task 8 `unitStatus` + `PENDING/PARTIALLY_PAID/PAID` to text + tone), `Chips({options, value, onChange})`, `Modal({open, title, onClose, children})` (Escape closes, focus trapped to first field), `Field({label, error, ...inputProps})`, `Select`, `Table({columns, rows})` (horizontal scroll on phones), `EmptyState`.
- `format.js`: `formatINR(n) → '₹1,42,000'` (`Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits: 2, minimumFractionDigits: 0})`), `formatDate('YYYY-MM-DD') → '25 Mar 2026'` (parse as parts, no timezone shift), `periodLabel('2026-03') → 'Mar 2026'`.
- `AuthContext` exposes `{user, login, logout, refresh}`; `user.role` and `user.mustChangePassword`. Routing: not logged in → `/login`; `mustChangePassword` → `/change-password`; PAYER → `/portal`; others → owner app. `client.js` on 403 `PASSWORD_CHANGE_REQUIRED` → navigate to `/change-password`.
- `AppShell`: left menu (Overview; "Ledgers" label; Lending; one entry per non-archived category from `GET /categories`; "+ New category"; Payers; Calendar; Settings; Logout). Under 768px: top bar with menu button opening a drawer. Active item uses `neu-in` + accent text.

- [ ] **Step 1: Implement tokens, CSS, `ui.jsx`, `format.js`, shell, login + change-password pages.** Login page matches mockup style A (centered `neu` card on base).
- [ ] **Step 2: Verify** `cd frontend && npm run build` → success, no warnings about missing imports. Run backend + `npm run dev`; in the browser at 1280px and 390px: login with a seeded MEMBER whose flag is set → forced to change-password → after change lands on Overview placeholder; contrast of muted text on base checked with the browser's accessibility panel (≥ 4.5:1).
- [ ] **Step 3: Commit** `feat(ui): neumorphism/clay design system, app shell, auth screens`.

---

### Task 11: Lending pages restyled

**Files:**
- Move + restyle: `pages/DashboardPage.jsx` → `pages/lending/LendingDashboardPage.jsx`, `BorrowersPage`, `BorrowerDetailPage`, `ReportsPage` → `pages/lending/`; restyle `components/{BorrowerFormModal,LoanFormModal,PaymentModal,DueCalendar,NotificationBanner}.jsx` using `ui.jsx`.

**Interfaces:**
- Routes: `/lending`, `/lending/borrowers`, `/lending/borrowers/:id`, `/lending/reports`. Old `/borrowers…` paths redirect. API calls unchanged except money values are numbers (Task 3 `toJSON`) and dates `'YYYY-MM-DD'` (use `formatDate`).

- [ ] **Step 1: Restyle** each page: replace dark slate/cyan classes with `neu`/`clay`/`ui.jsx` components; keep every existing feature and handler. The 12-month SVG chart uses accent/clay colors.
- [ ] **Step 2: Verify** `npm run build`; in the browser with the migrated copy: dashboard totals, one borrower's dues and payments, record + edit + delete a payment, Excel export opens — all match pre-migration behavior (Task 3 Step 10 numbers). Check 390px width has no horizontal page scroll.
- [ ] **Step 3: Commit** `feat(ui): restyle lending pages`.

---

### Task 12: Overview, calendar, category screens

**Files:**
- Create: `pages/overview/OverviewPage.jsx`, `pages/category/{NewCategoryModal,CategorySettingsPage,CategoryDashboardPage,ManagePlacesPage,AgreementDetailPage}.jsx`, `pages/category/modals/{MoveInModal,RecurringPaymentModal,RentChangeModal,BillingModal,MoveOutModal}.jsx`
- Modify: `pages/CalendarPage.jsx`, `App.jsx`, `api/client.js`

**Interfaces:**
- Routes: `/` Overview, `/c/:categoryId` dashboard, `/c/:categoryId/manage`, `/c/:categoryId/settings`, `/agreements/:id`, `/calendar`.
- All copy uses the category's labels (`placeLabel`/`unitLabel`/`payerLabel`), e.g. chip "All buildings", column "Shop", "Tenant".
- `MoveInModal`: fields per Task 8 `POST /agreements`; calls `/agreements/preview` on change (debounced 300ms) and shows "First due: ₹7,000 on 25 Mar 2026 · Next: ₹31,000 on 5 Apr 2026". Payer picker searches existing payers or "+ New".
- `MoveOutModal`: end date + last-month rule → shows preview (unpaid, advance held, credit, final due amounts) → apply-advance checkbox (default on), retained amount + reason → shows computed refund → confirm. Uses `/move-out/preview` then `/move-out`.
- `RecurringPaymentModal`: agreement picker (searchable "Shop A-1 · Ramesh Traders"), amount, date (default today IST), method (Cash/UPI/Bank/Cheque), notes; shows unpaid before saving.
- Overview: ledger cards (clay tones), totals, "Owed back" card (advance + credit, labeled "not income"), 12-month stacked SVG bar chart (one color per ledger, legend with names), upcoming/overdue lists linking to the item.
- Calendar: month grid of `/calendar` events with ledger filter chips.
- Category dashboard header has "Export" (calls `/categories/:id/export`, same blob download as lending's `downloadExcelReport`) and "+ Record payment"; unit rows link to `/agreements/:id` or open `MoveInModal` when vacant.

- [ ] **Step 1: Implement** pages and modals.
- [ ] **Step 2: Verify** `npm run build`; browser walkthrough (spec §13.8 first half): create "Commercial Rent" (Building/Shop/Tenant), Buildings A and B, shops; move in two tenants (one with advance, one without, one IN_ARREARS) and confirm preview values; record payments incl. partial; change a rent; move a tenant out with advance applied + retained; confirm dashboard numbers by hand; create "Parking" (Lot/Vehicle pass/Regular) and confirm labels everywhere; Overview reflects both; calendar shows all ledgers; 390px width usable.
- [ ] **Step 3: Commit** `feat(ui): overview, calendar, category ledger screens`.

---

### Task 13: Payers, logins, settings/family, payer portal UI

**Files:**
- Create: `pages/payers/{PayersPage,PayerDetailPage}.jsx`, `pages/settings/SettingsPage.jsx`, `pages/portal/PortalPage.jsx`
- Modify: `App.jsx`, `api/client.js`

**Interfaces:**
- Routes: `/payers`, `/payers/:id`, `/settings`, `/portal`.
- PayerDetail: agreements across categories with balances; "Login" card: create (username, starting password) / reset password / enable-disable.
- Settings: change password; ADMIN-only "Family accounts" card: list, create (username, name, starting password), reset password, enable/disable.
- Portal (inside `PortalShell`, phone-first single column): greeting, one card per agreement (place/unit, monthly amount, "Due now" in clay overdue/paid tone), month-by-month dues list, payments, advance held. Logout + change password. No owner navigation.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `npm run build`; browser (spec §13.8 second half): create a tenant login → log in as tenant at 390px → forced password change → sees only their shop(s); manually hit `/lending` in the URL → redirected to `/portal`; ADMIN creates a family member → member logs in → empty app with no categories or borrowers.
- [ ] **Step 3: Commit** `feat(ui): payers, logins, family accounts, payer portal`.

---

### Task 14: Cutover runbook and final verification

**Files:**
- Create: `docs/superpowers/runbooks/2026-11-04-finledger-v2-cutover.md`
- Modify: `README.md` (local dev instructions: `.env.local`, `npm run dev`/`test`, `create-admin`, no default admin; Render start command now `node src/index.js`, migrations run manually)

- [ ] **Step 1: Write the runbook** (not executed): freeze writes; Neon branch/backup; `pg_dump` backup; run `anomaly-scan.js` + `migration-snapshot.js` (before) against prod with explicit `NODE_ENV=production`; `prisma migrate resolve --applied 0_init`; `prisma migrate deploy`; snapshot (after) + diff; set Render env `JWT_SECRET` (existing value keeps sessions), `CORS_ORIGIN=<vercel domain>`, start command `node src/index.js`; deploy backend; deploy frontend; smoke test; rollback = restore Neon backup + redeploy previous commits.
- [ ] **Step 2: Fresh-copy rehearsal.** Drop and recreate `finledger_v2`, restore `live.dump` again, run `migrate deploy` path exactly as the runbook says (locally), snapshot diff → identical.
- [ ] **Step 3: Full check.** `npm test` (all PASS), `npm run build` (frontend), run every spec §13 acceptance item and note results in the final report; confirm `git status` shows no `.env*` or dump files, and `git log origin/main..` is only local (nothing pushed).
- [ ] **Step 4: Commit** `docs: v2 cutover runbook and local dev readme`.
