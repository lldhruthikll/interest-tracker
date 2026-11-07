# Money I Owe: Design (DRAFT, simplified)

Date: 2026-11-07
Status: draft, pending owner approval

## What it is

A separate **"Money I owe"** section in the sidebar. For each person the owner owes: how much was borrowed, how much was repaid, and how much is left. Optionally, when a tenant's rent is recorded, the owner can say it was paid to one of these people. That writes a line in the person's log and reduces what is owed.

Owner's words: "I just want to track the amount that I receive and I pay."

Real case: Asif, ₹2,00,000, no interest. A tenant's ₹7,500 rent is passed to Asif each month.

## Screens

**1. Money I owe (dashboard)**
- Totals: Total still owed · Repaid so far · Repaid this month.
- Table: Person · Borrowed · Repaid · Left · Last paid.
- Cards: one per person, with a progress bar and "₹1,77,500 left of ₹2,00,000".
- **+ Add person I owe** (name, phone optional, amount owed).

**2. Person page (the log)**
- Name, phone, Borrowed / Repaid / Left.
- Log, newest first. Examples:
  - `05 Nov 2026 · ₹7,500 · Rent from Shop A-1 (Ravi) paid to Asif`
  - `01 Aug 2026 · ₹2,00,000 · Borrowed`
  - `12 Sep 2026 · ₹10,000 · Repaid (own money)`
- Buttons: **+ Borrowed more**, **+ Repaid** (own money).

**3. Rent "Record payment" box (existing), one added question**
- "Paid to someone you owe?" **No / Yes**.
- Yes shows a dropdown of people still owed, plus "+ New person I owe…" (name, phone, amount owed).
- Opens on Yes with the same person if this tenant's last payment was passed on to someone still owed. Works for any tenant.

## Rules

1. Linking a rent payment adds a "Repaid" line to the person's log, dated the payment date, with the message above. Left goes down by that amount.
2. Never pass on more than is left. Example: ₹5,000 left and a ₹7,500 rent payment means ₹5,000 is passed on and ₹2,500 stays with the owner.
3. Deleting the rent payment removes its log line. Editing its amount updates the log line (rule 2 still applies).
4. No interest.
5. Tenants (portal logins) and other family members never see this section.

## Not in this round

Interest, debts on Overview/calendar/exports, "clears around" estimates, reminders.

## Build notes (for the builder)

- Two new tables: people I owe, and log entries (BORROWED / REPAID, amount, date, note, optional link to the rent payment it came from; deleting that payment deletes the entry). Both owner-scoped via `ownerDb`.
- Ships as an additive Prisma migration with `migrate deploy` on Neon, after a backup. Existing data untouched.
- Late rent recorded after a tenant has moved out is not linkable, because those payments can't be edited afterwards.
- Builds on the 2-level categories change, which gets committed first. Log messages show the place name only when the category has a top level.
