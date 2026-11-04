# FinLedger v2 production cutover runbook (DRAFT, not executed)

Rehearsed on a fresh local restore of a live `pg_dump` on 2026-11-04 (see "Rehearsal"). Not yet run against Neon or Render.

Run order matters. Do not push or merge `feat/finledger-v2` until step 9: Vercel builds a preview for every pushed branch, and that preview would be the new UI talking to the old API.

## Prerequisites
- Neon connection string for the live DB (referred to below as `$PROD_URL`; never paste it into the repo or chat).
- `pg_dump`/`psql` 18 (live is Postgres 18.6). Local: `docker run --rm --network host -v "$PWD":/b postgres:18-alpine ...`.
- Render and Vercel access; note the current deployed commit on each (needed for rollback).
- Scripts run from `backend/` with `npm install` done and `npx prisma generate` run.

Production scripts do not use `scripts/local.js` (it forces a local DB). Prefix every command with `DATABASE_URL="$PROD_URL" NODE_ENV=production`.

## 1. Freeze writes
Tell users to stop entering data. Optional hard stop: suspend the Render service (the old API stays down until step 8).

## 2. Backups (two independent copies)
1. Neon console: create a branch of the production branch named `pre-v2-2026-11-04` (point-in-time copy, instant restore source).
2. `pg_dump -Fc "$PROD_URL" -f finledger-live-pre-v2.dump` and keep the file outside the repo. Check it is non-empty: `pg_restore -l finledger-live-pre-v2.dump | head`.

## 3. Owner-approved data fix (loan 9 duplicate August 2026 due)
Guarded; it aborts and changes nothing if the rows do not match exactly. Running it twice fails the second time.
```
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f backend/scripts/fixes/2026-11-04-loan9-duplicate.sql
```
Expected output: `DO`. Any `ERROR` means stop and investigate (data differs from the rehearsal copy).

## 4. Anomaly scan and snapshot (before)
```
cd backend
DATABASE_URL="$PROD_URL" NODE_ENV=production node scripts/anomaly-scan.js
DATABASE_URL="$PROD_URL" NODE_ENV=production node scripts/migration-snapshot.js > snapshot-before.json
```
Scan must end with `duplicates: no` and show 0 in every section. Snapshot must equal:
User 1, Borrower 7, Loan 14, InterestRecord 44, Payment 37, PaymentAllocation 37; principal 496500.00, monthlyInterest 13320.00, interestAmount 49480.00, interestPaid 40990.00, paymentAmount 40990.00, allocationAmount 40990.00.
If anything differs (for example new data entered since the dump), stop and review before migrating; do not edit the expected values to fit.

## 5. Migrate
The live DB was created by `prisma db push`, so mark the baseline as already applied, then apply the rest:
```
DATABASE_URL="$PROD_URL" NODE_ENV=production npx prisma migrate resolve --applied 0_init
DATABASE_URL="$PROD_URL" NODE_ENV=production npx prisma migrate deploy
```
Expected: `Applying migration 1_v2_accounts`, `Applying migration 2_recurring`, `All migrations have been successfully applied.`
The migration is one-way. The only way back is restoring a backup (see Rollback).

## 6. Snapshot (after) and diff
```
DATABASE_URL="$PROD_URL" NODE_ENV=production node scripts/migration-snapshot.js > snapshot-after.json
diff snapshot-before.json snapshot-after.json && echo IDENTICAL
DATABASE_URL="$PROD_URL" NODE_ENV=production npx prisma migrate status   # "Database schema is up to date!"
```
Must print `IDENTICAL`. If not, go to Rollback (restore) before deploying anything.
Also check the existing user is now an admin: `select id, role from "User";` should show one `ADMIN` row. Do NOT run `create-admin.js` on production (it is only for an empty DB).

## 7. Render configuration
Environment:
- `JWT_SECRET`: keep the existing value (sessions survive).
- `DATABASE_URL`: unchanged (Neon).
- `CORS_ORIGIN`: the Vercel production domain, e.g. `https://<app>.vercel.app` (comma-separated list allowed).
- `NODE_ENV=production`.
Settings: Build `npm install && npx prisma generate`; Start `node src/index.js` (no `prisma db push`).

## 8. Deploy backend, then frontend
1. Merge/push `feat/finledger-v2` to `main` (this is the first push). Render deploys the backend from it; wait for "Live".
2. Backend smoke: `curl https://<render-host>/health` proves it is up (a 401 on `/api/dashboard` without a token also does).
3. Vercel deploys the frontend from the same push. `VITE_API_URL` is unchanged.

## 9. Smoke test (browser, production)
- Log in with the existing owner credentials (old session token should also still work).
- Dashboard: active principal 446,500; pending interest 7,240; 13 active loans (values from the rehearsal copy; recheck against the pre-cutover app if data changed).
- Open one borrower and one loan; payment history matches the old app.
- Excel export downloads.
- Create and delete a test category, then lift the write freeze.

## Rollback
Before step 5 completes: nothing to roll back except the step 3 data fix (restore the backup if you want it undone).
After step 5 (migration is one-way):
1. Stop traffic (suspend Render service).
2. Restore data: Neon console restore the production branch from `pre-v2-2026-11-04` (or promote that branch), or `pg_restore --clean --if-exists --no-owner -d "$PROD_URL" finledger-live-pre-v2.dump`.
3. Redeploy the previous commits: Render, "Deploy a specific commit" with the commit recorded in Prerequisites (and restore the old start command and env if changed); Vercel, promote the previous production deployment.
4. Verify with the old app, then unfreeze.
If the migration succeeds but the app misbehaves, the same restore applies: data entered after cutover is lost on restore, so decide quickly and export anything new first (`/api` Excel export or `pg_dump`).

## Rehearsal (2026-11-04, local)
Fresh DB `finledger_rehearsal` restored from `live.dump` (postgres:18-alpine `pg_restore --no-owner --no-acl`), steps 3 to 6 run as written via `node scripts/local.js --env <file>`. Fix: `DO`. Scan: 0 anomalies, `duplicates: no`. Snapshot before = after = expected values above. `migrate status`: up to date. User 1 became `ADMIN`; no borrower without an owner.
