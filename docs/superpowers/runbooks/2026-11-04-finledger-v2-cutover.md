# FinLedger v2 production cutover runbook (DRAFT, not executed)

Rehearsed on a fresh local restore of a live `pg_dump` on 2026-11-04 (see "Rehearsal"). Not yet run against Neon or Render.

Only the local equivalent was rehearsed (`node scripts/local.js --env <file>` against a local restore). The production command path (`psql "$PROD_URL"`, plain `node`/`npx prisma` with `DATABASE_URL="$PROD_URL" NODE_ENV=production`) has not been run literally; read each command before running it.

Run order matters. Do not push or merge `feat/finledger-v2` until step 8. Vercel builds a preview for every pushed branch, and that preview would be the new UI talking to the old API. Merging to `main` deploys Vercel production at once, and would deploy Render at the same time if auto-deploy were on (step 1 turns it off, so Render deploys only when you trigger it in step 8).

Working directory: every command says where it runs. "Repo root" is the checkout of `feat/finledger-v2`; "`backend/`" is `<repo root>/backend`.

## Prerequisites
- Neon connection string for the live DB (referred to below as `$PROD_URL`; never paste it into the repo or chat). Export it in the shell you use for every step.
- `pg_dump`/`pg_restore`/`psql` 18 (live is Postgres 18.6). Without local 18 tools, use the Docker image instead (examples in step 2).
- Render and Vercel access; note the current deployed commit on each (needed for rollback).
- In `backend/`: `npm install` and `npx prisma generate` done (generate does not touch any database).

Production scripts do not use `scripts/local.js` (it forces a local DB). Prefix every production command with `DATABASE_URL="$PROD_URL" NODE_ENV=production`.

## 1. Freeze writes and stop the old API (mandatory)
1. Tell users to stop entering data.
2. Render dashboard: **suspend** the backend service. This is required before step 3, not optional: the v1 start script runs `prisma db push`, which must never run against the database while it is being fixed or after it is migrated.
3. Render dashboard, same service, before step 5:
   - Settings: turn **Auto-Deploy off**.
   - Settings: Build `npm install && npx prisma generate`; Start `node src/index.js` (no `prisma db push`).
   - Environment: as in step 7 (`JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGIN`, `NODE_ENV=production`).
   With these in place, nothing can boot v1 with `db push` against the migrated DB. The service comes back only when you explicitly deploy v2 in step 8.

## 2. Backups (two independent copies)
Run from any directory outside the repo (the dump must not land in the repo).
1. Neon console: create a branch of the production branch named `pre-v2-2026-11-04` (point-in-time copy, instant restore source).
2. Dump and check it is non-empty:
   ```
   test -n "$PROD_URL" && echo "PROD_URL is set" || echo "PROD_URL is NOT set: stop"
   pg_dump -Fc --no-owner "$PROD_URL" -f finledger-live-pre-v2.dump
   pg_restore -l finledger-live-pre-v2.dump | head
   ```
   Without local Postgres 18 tools:
   ```
   docker run --rm -e PROD_URL -v "$PWD":/b -w /b postgres:18-alpine \
     sh -c 'pg_dump -Fc --no-owner "$PROD_URL" -f finledger-live-pre-v2.dump && pg_restore -l finledger-live-pre-v2.dump | head'
   ```

## 3. Owner-approved data fix (loan 9 duplicate August 2026 due)
Run from the repo root. First confirm you are pointed at the right database; stop if any check fails:
```
test -n "$PROD_URL" && echo "PROD_URL is set" || echo "PROD_URL is NOT set: stop"
psql "$PROD_URL" -Atc "select current_database(), inet_server_addr(), version()"
```
Compare the database name and Postgres version (18.x) with the Neon console for the production branch (and the server address with the host in the Neon connection details, if shown). If they do not match, stop.

The fix is guarded; it aborts and changes nothing if the rows do not match exactly. Running it twice fails the second time.
```
psql "$PROD_URL" -v ON_ERROR_STOP=1 -f backend/scripts/fixes/2026-11-04-loan9-duplicate.sql
```
Expected output: `DO`. Any `ERROR` means stop and investigate (data differs from the rehearsal copy).

## 4. Anomaly scan and snapshot (before)
Run from `backend/`:
```
DATABASE_URL="$PROD_URL" NODE_ENV=production node scripts/anomaly-scan.js
DATABASE_URL="$PROD_URL" NODE_ENV=production node scripts/migration-snapshot.js > snapshot-before.json
```
Scan must end with `duplicates: no` and show 0 in every section. Snapshot must equal:
User 1, Borrower 7, Loan 14, InterestRecord 44, Payment 37, PaymentAllocation 37; principal 496500.00, monthlyInterest 13320.00, interestAmount 49480.00, interestPaid 40990.00, paymentAmount 40990.00, allocationAmount 40990.00.
If anything differs (for example new data entered since the dump), stop and review before migrating; do not edit the expected values to fit.

## 5. Migrate
Check first that step 1.3 is done (Render suspended, auto-deploy off, start command `node src/index.js`).
Run from `backend/`. The live DB was created by `prisma db push`, so mark the baseline as already applied, then apply the rest:
```
DATABASE_URL="$PROD_URL" NODE_ENV=production npx prisma migrate resolve --applied 0_init
DATABASE_URL="$PROD_URL" NODE_ENV=production npx prisma migrate deploy
```
Expected: `Applying migration 1_v2_accounts`, `Applying migration 2_recurring`, `All migrations have been successfully applied.`
A failing migration file leaves none of its own changes behind (checked locally with Prisma 5.22), but a migration applied before it stays applied. On any error, go to Rollback (restore).
The migration is one-way. The only way back is restoring a backup (see Rollback).

## 6. Snapshot (after), diff, and account checks
Run from `backend/`:
```
DATABASE_URL="$PROD_URL" NODE_ENV=production node scripts/migration-snapshot.js > snapshot-after.json
diff snapshot-before.json snapshot-after.json && echo IDENTICAL
DATABASE_URL="$PROD_URL" NODE_ENV=production npx prisma migrate status   # "Database schema is up to date!"
psql "$PROD_URL" -Atc 'select id, role, "mustChangePassword" from "User"'
```
Must print `IDENTICAL`. If not, go to Rollback (restore) before deploying anything.
The `User` query should show one `ADMIN` row. Do NOT run `create-admin.js` on production (it is only for an empty DB).

If there is any chance the admin still uses the old default password `admin123`, force a change at next login:
```
psql "$PROD_URL" -v ON_ERROR_STOP=1 -c "update \"User\" set \"mustChangePassword\" = true where role = 'ADMIN'"
```

## 7. Render configuration (check; it was set in step 1.3)
Environment:
- `JWT_SECRET`: must be set, and must NOT be the old hard-coded fallback `super-secret-interest-manager-key-2026` (v1 used it whenever the variable was missing). Check the value in the Render dashboard; do not print it anywhere else.
  - Recommended: rotate it to a new random value (for example `openssl rand -hex 32`). Cost: every existing session is invalidated and everyone logs in again. If it is the old fallback, rotating is required.
- `DATABASE_URL`: unchanged (Neon).
- `CORS_ORIGIN`: the Vercel production domain, e.g. `https://<app>.vercel.app` (comma-separated list allowed).
- `NODE_ENV=production`.
Settings: Build `npm install && npx prisma generate`; Start `node src/index.js` (no `prisma db push`); Auto-Deploy off.

## 8. Deploy backend, then frontend
1. Repo root: merge `feat/finledger-v2` into `main` and push (this is the first push). This starts the Vercel production deploy at once; Render does not deploy (auto-deploy is off).
2. Render dashboard: resume the service if needed and run **Manual Deploy** of the merge commit on `main`. Wait for "Live" on that commit. Writes are still frozen, so the few minutes where the new UI may be up before the new API are acceptable. (Render may start the last deployed v1 build on resume; with the step 1.3 start command it cannot change the schema, and the freeze covers that window. Not verified on Render.)
3. Backend smoke: `curl https://<render-host>/health` proves it is up (a 401 on `/api/dashboard` without a token also does).
4. Vercel: confirm the production deployment for the merge commit is Ready. `VITE_API_URL` is unchanged.

## 9. Smoke test (browser, production)
- Log in with the existing owner credentials (if `JWT_SECRET` was kept, an old session token also still works; if it was rotated, everyone must log in again).
- Dashboard: active principal 446,500; pending interest 7,240; 13 active loans (values from the rehearsal copy; recheck against the pre-cutover app if data changed).
- Open one borrower and one loan; payment history matches the old app.
- Excel export downloads.
- Create and delete a test category, then lift the write freeze.
- Optional: turn Render auto-deploy back on.

## Rollback
Before step 5 completes: nothing to roll back except the step 3 data fix (restore the backup if you want it undone).
After step 5 (migration is one-way):
1. Stop traffic (suspend Render service).
2. Restore data: Neon console restore the production branch from `pre-v2-2026-11-04` (or promote that branch), or, from the directory holding the dump, `pg_restore --clean --if-exists --no-owner -d "$PROD_URL" finledger-live-pre-v2.dump` (Docker alternative: as in step 2, with `pg_restore` in place of `pg_dump`).
3. Redeploy the previous commits: Render, "Deploy a specific commit" with the commit recorded in Prerequisites (and restore the old start command and env if changed); Vercel, promote the previous production deployment.
4. Verify with the old app, then unfreeze.
If the migration succeeds but the app misbehaves, the same restore applies: data entered after cutover is lost on restore, so decide quickly and export anything new first (`/api` Excel export or `pg_dump`).

## Rehearsal (2026-11-04, local)
Fresh DB `finledger_rehearsal` restored from `live.dump` (postgres:18-alpine `pg_restore --no-owner --no-acl`), steps 3 to 6 run as written via `node scripts/local.js --env <file>`. Fix: `DO`. Scan: 0 anomalies, `duplicates: no`. Snapshot before = after = expected values above. `migrate status`: up to date. User 1 became `ADMIN`; no borrower without an owner.
The Render steps (suspend, settings, manual deploy) and the `$PROD_URL` command forms were not rehearsed.
