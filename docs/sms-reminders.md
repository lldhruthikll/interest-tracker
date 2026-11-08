# SMS rent reminders

Each day at 09:00 IST, FinLedger texts every tenant whose rent is due **that day** and not fully paid. The text gives that month's amount and, when more is owed, the tenant's total unpaid:

> Hi Ravi, rent of ₹7,500 for A-1 (Nov 2026) is due today. Total unpaid: ₹22,500.

The SMS goes out from your own phone through the SMS Push Gateway app (`my_proj/android_in_app`, see its `SETUP.md`).

```
GitHub Actions (daily) ──POST /api/jobs/rent-reminders + X-Job-Key──▶ FinLedger API (Render)
      ──signed push (FCM)──▶ phone running SMS Push Gateway ──SIM──▶ tenant
```

## Who gets a text

- Only accounts that switched on **Settings → SMS rent reminders** (off by default). One phone sends for every account that switches it on.
- Active agreements with a due dated today (IST) that still has money unpaid.
- The tenant's phone from their payer record. A 10-digit number (or one starting with 0) gets `+91`; set `SMS_DEFAULT_COUNTRY_CODE` to change that. Numbers that can't be read are skipped and listed in the job output.
- Each text has a fixed id per due (`rent-<dueId>`). If the job runs twice in one day, the phone drops the repeat.

## Deploy (once)

1. **Database:** migration `4_sms_reminders` adds one column, `User.smsReminders`, default false. Run it with `prisma migrate deploy` along with `3_money_i_owe`.
2. **Render backend environment** (values never go in git):

   | Variable | Value |
   |---|---|
   | `SMS_SERVICE_ACCOUNT_JSON` | the whole Firebase service-account JSON (one line is fine) |
   | `SMS_DEVICE_TOKEN` | device token shown in the phone app |
   | `SMS_SECRET` | signing secret shown in the phone app |
   | `JOB_SECRET` | a long random value, e.g. `openssl rand -hex 32` |

3. **GitHub repo secrets** (Settings → Secrets and variables → Actions):
   - `FINLEDGER_API_URL` = `https://<render-host>/api`
   - `FINLEDGER_JOB_SECRET` = the same `JOB_SECRET`
4. Push `main`. The workflow `.github/workflows/rent-reminders.yml` runs daily. **Actions → Rent reminders → Run workflow** runs it once by hand.

## Job output

The output is safe to keep in Actions logs: it holds no phone numbers or texts.

```json
{ "date": "2026-11-05", "sent": 3, "skipped": [{ "agreementId": 7, "reason": "phone number not usable" }], "failed": [] }
```

- `sent`: Google accepted the push. Whether the SMS was then sent and delivered shows in the phone app's log.
- `401`: wrong or missing job key.
- `503`: the `SMS_*` variables are not set on Render.

## Limits

- GitHub may start scheduled runs some minutes late, and a sleeping Render instance takes up to a minute to wake. The workflow retries.
- On a public repository, GitHub pauses scheduled workflows after 60 days without repository activity, and you have to re-enable them.
- Reminders go out on the due date only. There are no "overdue" follow-ups yet.
