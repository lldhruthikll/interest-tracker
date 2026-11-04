# FinLedger v2: Design (DRAFT)

Date: 2026-11-04
Branch: `feat/finledger-v2`
Status: draft, pending owner approval

## 1. Intent

FinLedger is a single-user lending tracker (borrowers, loans, monthly interest dues, FIFO payments). The owner also earns monthly income from commercial buildings (shops rented to tenants) and a parking business (monthly passes for regulars). They want to keep **one ledger app** for all of it, used by **several family members**, each with fully private books, and give **tenants/regulars a read-only login** to see their own dues.

Why: today rent and parking are tracked outside the app. The owner needs to see, per building and combined, who has paid, who hasn't, what was collected, and how much advance (security deposit) money they hold and owe back.

## 2. Goals

1. **Accounts with full isolation.** Each family member has their own login and their own ledgers. No one, including the admin, sees another member's data.
2. **Lending stays as it works today.** Same features (borrowers, loans, monthly interest dues, FIFO payment allocation, payment edit/delete with FIFO reversal, calendar, Excel export, 12-month interest chart), restyled.
3. **Recurring-income ledger, generic.** One engine serves any "fixed monthly amount from a person for a thing" income source. The owner creates **categories** (e.g. "Commercial Rent", "Parking") and names the parts (Place / Unit / Payer → "Building / Shop / Tenant" or "Lot / Vehicle pass / Regular"). Rent and parking are just two categories; no category-specific code.
4. **Per-category dashboard, isolated from lending,** with a filter for one place (Building A) vs all places, plus an **Overview** page combining every ledger.
5. **Tenant/regular portal.** The ledger owner creates a login for a payer; the payer sees only their own units, dues, payments and advance. Read-only. Phone-first.
6. **New UI** in the chosen style (section 9) across every screen, usable on phone widths.
7. **Built and tested locally without touching live data** (section 11).

## 3. Non-goals (this round)

- Income that isn't a fixed monthly amount (daily cash takings, one-off sales).
- Expense tracking (maintenance, property tax, electricity).
- Sharing a ledger between family members, or an admin view of others' data.
- Tenants paying online, or SMS/WhatsApp reminders.
- Deploying v2 to Vercel/Render or migrating the live database. The design must make that possible later (section 12), but this round ends at a working, tested local build.

## 4. Anti-goals (failure even if it "works")

- Any local run, test, or script reads from or writes to the live Neon DB or calls the live Render API (except the single read-only data copy in section 11).
- Any existing lending number (principal, interest records, paid amounts, payments, allocations) changes value during migration.
- Advance/deposit money counted as income anywhere.
- A tenant, or another family member, can read data that isn't theirs by guessing an ID or calling an endpoint directly.
- Neumorphism so low-contrast that numbers and statuses are hard to read.

## 5. Current state (verified by reading the code)

- Backend: Node/Express, Prisma 5, PostgreSQL (Neon). `backend/src/services/interestService.js` generates monthly `InterestRecord`s and allocates payments FIFO. `paymentController.js` reverses allocations on edit/delete.
- Frontend: React 18 + Vite + Tailwind 3 + lucide-react + react-router 6. The 12-month chart is hand-drawn SVG (no chart library).
- Auth: single `User` table, JWT; no ownership on any other table. `authController.login` auto-creates `admin`/`admin123` if no users exist. `JWT_SECRET` has a hard-coded fallback. CORS is `origin: '*'`.
- Money fields are `Float`.
- Dates: recent commit `a100987` compares due dates as UTC date strings. "Today" is computed in UTC, which is the previous day in IST between 00:00 and 05:30.
- `backend/.env` points at the **live Neon DB**; `frontend/.env` points at the **live Render API**. `npm start` runs `prisma db push` on every deploy.
- A local Docker Postgres (`interest_db`, port 5433) is defined in `docker-compose.yml`.
- Tests: one script (`backend/src/tests/fifoTest.js`) checking due-date generation.

## 6. Users and roles

| Role | Who | Can |
|---|---|---|
| `ADMIN` | The owner (the existing user) | Everything a MEMBER can, plus create family MEMBER accounts and reset their passwords. Cannot see members' data. |
| `MEMBER` | Family member | Own lending ledger, own categories, create/reset logins for their own payers. |
| `PAYER` | Tenant / parking regular | Read-only view of their own agreements, dues, payments and advance. Change own password. |

- No public sign-up. ADMIN creates MEMBERs; a MEMBER/ADMIN creates PAYER logins from a payer's record.
- New logins get a starting password from their creator and must change it on first login.
- A PAYER login belongs to exactly one payer record (and so to one owner). Ending all of a payer's agreements does not delete their login; the owner can disable it.
- Username is a free string (phone number or email); unique across the system.

## 7. Recurring-income model

Shape below; exact table/column names are the builder's call.

- **Category** (owned by a user): name, labels for place/unit/payer (singular), optional color/icon.
- **Place**: belongs to a category. E.g. "Building A", "Main Lot".
- **Unit**: belongs to a place. Name (e.g. "A-1", "Car pass #12"), standard monthly amount, notes. For parking the vehicle type lives in the unit name/notes; the amount is set per unit/agreement.
- **Payer**: a person, owned by the user (shared across that user's categories). Name, phone, notes, optional login.
- **Agreement** (tenancy / pass): links one payer to one unit for a period. Start date, optional end date, due day of month, advance amount, status (ACTIVE / ENDED). One unit has at most one ACTIVE agreement; history of past agreements is kept. A payer may hold several agreements (two shops).
- **Rate history**: an agreement's monthly amount, with "effective from month". Changing the rent adds a row; past dues keep their old amount.
- **Monthly due**: one per agreement per **calendar month** of occupancy, generated up to today (the same idea as lending's `InterestRecord`s). Tracks paid amount and status (PENDING / PARTIALLY_PAID / PAID). Amount = rate in effect for that month, adjusted for partial months (below).
- **Billing settings, per agreement** (owner's requirement: set for each tenant/regular, editable; defaults below are the designer's call):
  - **Timing**: `IN_ADVANCE` (default): month M's rent is due on the due day of month M; if the agreement starts after that day, the first month's due date is the start date. `IN_ARREARS`: month M's rent is due on the due day of month M+1. Due days past month end clamp to the last day.
  - **First partial month** (start not on the 1st): `PRORATED` (default) = monthly amount × days occupied ÷ days in month, rounded to the paisa; `FULL` = whole month; `FREE` = no due for that month.
  - **Last partial month** (end not on the month's last day): same three options; default comes from the agreement, and the owner can change it on the move-out screen. If a full month was already charged (in advance) and the result is lower, the due is reduced; anything already paid above the new amount becomes credit.
  - Example: move-in Mar 25, due day 5, rent ₹31,000, `IN_ADVANCE` + `PRORATED` → March due ₹7,000 on Mar 25; April due ₹31,000 on Apr 5. Same tenant with `IN_ARREARS` → March due ₹7,000 on Apr 5; April due on May 5.
- **Payment** + **allocation**: payment recorded against an agreement; allocated FIFO to oldest unpaid dues; edit/delete reverses allocations then re-allocates, as lending does today.
- **Advance ledger**: entries per agreement: RECEIVED, APPLIED_TO_RENT, RETAINED (e.g. damages, with note), REFUNDED. "Advance held" = RECEIVED − APPLIED − RETAINED − REFUNDED. Never counted as income except as below.

### Behaviors

- **Move in:** pick unit + payer (or create payer), start date, due day, monthly amount (prefilled from unit), timing, first/last partial-month rules, advance received (optional). The form previews the first two dues before saving.
- **Changing billing settings later:** applies to dues not yet generated; already-generated unpaid dues are recalculated; paid or partially paid dues are not changed.
- **Rent change:** new amount from a chosen month. Already-generated dues for that month onward that are still unpaid are updated to the new amount; paid/partially paid dues are not changed. *(Builder's call how to present this; the rule is: never change money already collected.)*
- **Move out / settlement:** set end date (no dues generated after the end month). Settlement screen shows unpaid dues and advance held. Owner can (a) apply advance to unpaid dues (recorded as a payment with method "advance", FIFO), (b) retain an amount with a reason, (c) refund the rest. Unit becomes vacant.
- **Overpayment:** any amount left after allocation is held as **credit** on the agreement and auto-applied to the next generated due. *(Designer's call; lending keeps today's behavior.)* Credit is the payer's money: it is shown with advances under "owed back" (as its own line), and at settlement it is applied to unpaid dues first, then refunded with the advance. *(Designer's call.)*
- **Income recognition:** collected income for a month = sum of allocations to dues, dated by payment date. Advance applied to rent counts as rent collected on the settlement date. Retained advance is shown separately as "advance retained", not as rent.
- **Overview vs lending basis:** the Overview page reports **cash received in the month by payment date** for every ledger, including lending, labeled "received". The Lending page's existing analytics (grouped by due month) stay exactly as they are. *(Designer's call: keeps lending unchanged and makes the combined view consistent.)*

## 8. Screens

All owner screens share a left menu: **Overview**, then **Ledgers**: Lending, each category, "+ New category"; then **Settings**. On phones the menu collapses into a drawer/bottom bar.

1. **Login.** One page for all roles; routes to owner app or payer portal by role. Forced password change screen on first login.
2. **Overview.** This month across all ledgers: collected, pending, overdue per ledger and total; advances held (separate, labeled "owed back"); 12-month stacked trend by ledger (extend the existing SVG chart); upcoming and overdue dues from every ledger.
3. **Lending.** Existing dashboard, borrowers list/detail, calendar, reports, payment modal, all restyled. Behavior unchanged except the date fix in section 10.
4. **Category dashboard.** Place chips (All / each place). Stat cards: collected this month vs due, pending, advances held, occupied units. Unit table: unit, current payer, amount, this month's status (Paid / Partial / Overdue / Vacant). "+ Record payment".
5. **Manage places and units** (add/rename/archive).
6. **Unit / agreement detail.** Current payer, amount, due day, advance; month-by-month dues with status; payment history (edit/delete); rate history; past agreements; actions: record payment, change rent, move out.
7. **Payers list and payer detail.** All agreements across categories; create/reset/disable their login.
8. **Category settings.** Name and labels. Deleting a category with data is blocked; archiving hides it.
9. **Excel export per category** (dues, payments, advance ledger), alongside the existing lending export.
10. **Calendar.** Shows dues from all ledgers with a ledger filter.
11. **Settings.** Change password. ADMIN only: family accounts (create, reset password, disable).
12. **Payer portal (phone-first).** Their units and current amount, what's due now, month-by-month history, payments, advance held. No totals of anyone else, no owner data.

## 9. Visual style (owner chose "A")

Neumorphism base with claymorphism accents, as shown in mockup `clay-neu-blend.html` option A:

- Base surface cool grey `#e8ebf1`; neumorphic raised/inset shadows (`8px 8px 16px #c8ccd4, -8px -8px 16px #fff` / inset equivalents) for frame, menu, tables, inputs, chips, secondary buttons.
- Clay accents (pastel fills + inner highlight + soft drop) for stat cards and status pills: green `#c9f2dc` paid, amber `#ffeab5` partial, rose `#ffd9d6` overdue, lavender `#dcd6ff` advances; dark text on each.
- Primary accent violet `#7c6cf2` for main buttons and the active state.
- Font: Nunito (800–900 for numbers and headings), tabular numerals for money.
- Large radii (16–28px).
- Contrast: body text and numbers must meet WCAG AA against the grey base; status is never conveyed by color alone (always a word).
- Implement as Tailwind theme tokens + a few component classes (`neu`, `neu-in`, `clay`), not per-component inline shadows.
- Indian number formatting (₹1,42,000).

## 10. Technical decisions

- **Ownership:** every owned row is scoped to a user. Access checks live in one place (middleware/helper that resolves the current owner and is used by every query), not repeated ad hoc per controller. Fetching another owner's record by ID returns 404.
- **Payer endpoints** are a separate route group (`/api/portal/*`), read-only, scoped to the logged-in payer's record. Owner endpoints reject PAYER tokens.
- **Money:** switch all money columns to `Decimal(12,2)`; do arithmetic without floats.
- **Dates:** dues are calendar dates. Business timezone is **Asia/Kolkata**: "today", overdue, and month boundaries are computed in IST. Keep storing due dates as date-only values so the `a100987` fix still holds.
- **Security fixes:** server refuses to start without `JWT_SECRET`; remove `admin`/`admin123` auto-creation; CORS restricted to configured frontend origin(s); basic rate limiting on login; JWT carries role and user id; disabled users are rejected.
- **Schema changes via Prisma Migrate** (not `db push`) so the production migration in section 12 is a reviewed, repeatable script. The backend start command must stop running `db push`.
- **Reuse:** the recurring-income due generation and FIFO allocation should follow the lending implementation; sharing code between them is the builder's call.
- **Tests:** Node's built-in `node:test` (no new framework). See section 13.

## 11. Local-only development and the data copy

- Work only on branch `feat/finledger-v2`. **Do not push the branch** until the owner decides on deployment: Vercel builds preview deployments for pushed branches.
- Local DB: Docker Postgres from `docker-compose.yml` (port 5433), new database for v2.
- Local env files, separate from the existing ones (existing `backend/.env` and `frontend/.env` are left untouched): backend dev script loads a local env file pointing at the Docker DB; frontend uses `.env.development.local` with `VITE_API_URL=http://localhost:5000/api`.
- **Guard:** outside production, the backend refuses to start if `DATABASE_URL` contains `neon.tech` (or any non-local host).
- **One-time data copy:** `pg_dump` (read-only) of the live Neon DB into the local Docker DB, using a `pg_dump` version matching Neon's server. The owner authorized the builder to do this: the builder reads the connection string from `backend/.env` without printing or copying it anywhere else, and does not modify that file. The dump file stays outside the repo (scratch dir). This is the only allowed contact with live data.
- Add `.superpowers/` to `.gitignore`.

## 12. Migration of existing data (designed and tested locally; run against live only later)

- Existing `User` becomes `ADMIN` and owner of all existing borrowers/loans/payments.
- `Float` → `Decimal(12,2)` conversions.
- **Anomaly pass first (designer's call):** before migrating, a read-only script scans the copy and reports: due dates not at UTC midnight (e.g. 18:30 UTC from IST-local generation), more than one interest record per loan per calendar month, and money values with sub-paisa noise. Normalization rules: a due date maps to its **IST calendar date**; sub-paisa noise rounds to the nearest paisa. Duplicate month records are **not** auto-merged: the script reports them and the migration stops until the owner decides. The report is shown to the owner before migration.
- Run on the local copy, then verify: row counts per table, and sums of principal, monthlyInterest, interest record amounts and paid amounts, payment amounts and allocation amounts are identical before and after (to the paisa). This check is a script that can be rerun before the real migration.
- Write a short runbook for the later production cutover (backup, run migration, verify, deploy backend, deploy frontend). Executing it is out of scope.

## 13. Acceptance checks

1. Migration verification script passes on the local copy of live data.
2. Lending screens show the same numbers before and after migration for the copied data.
3. Isolation: user B gets 404 for user A's borrower, category, place, unit, payer, agreement, payment (automated test).
4. Payer portal: payer sees only their own agreements; any owner endpoint returns 403 for a payer token (automated test).
5. Recurring income (automated tests): due generation across month ends and Feb; each timing × partial-month combination for move-in and move-out (including the Mar 25 example in section 7); rate change mid-stream; FIFO across multiple months; partial payment; overpayment credit; payment edit/delete reversal; move-out with advance applied, retained and refunded; "advance held" math.
6. IST date test: at 00:30 IST, a due dated "today" (IST) is "due today", not "upcoming".
7. Backend refuses to start with a Neon URL in local mode.
8. Manual walkthrough in the browser at phone and desktop width: create category "Commercial Rent" (Building/Shop/Tenant) with Buildings A and B, move in tenants with and without advance, record payments, change a rent, move a tenant out; create "Parking" (Lot/Vehicle pass/Regular); create a tenant login and view the portal; create a family member and confirm they see an empty app.

## 14. Left to the builder

- Exact table and column names, API route shapes, and component breakdown.
- Whether lending and recurring income share one allocation module or two similar ones.
- Whether to keep the old lending pages and restyle them, or rewrite them, as long as behavior is unchanged.
- Chart implementation (extend the existing hand-drawn SVG; no new chart dependency unless it's clearly needed).
