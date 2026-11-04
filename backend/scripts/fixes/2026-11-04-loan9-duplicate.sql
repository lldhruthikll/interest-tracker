-- Owner-approved fix (2026-11-04): loan 9 has two "August 2026" dues (ids 17 on 08-20 and
-- 18 on 08-29) because its start date was edited from 07-20 to 07-29. Record 17 and the
-- "Cleared due for August 2026" payment 18 that paid it are removed; record 18 (paid by
-- payment 19) stays. All-or-nothing: any guard failing raises and rolls everything back,
-- so a second run fails without changes.
-- Run (local only): docker exec -i interest_db psql -U postgres -d <db> -v ON_ERROR_STOP=1 < this file
DO $$
DECLARE n int;
BEGIN
  DELETE FROM "PaymentAllocation" WHERE "paymentId" = 18 AND "interestRecordId" = 17;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'PaymentAllocation(18,17): expected 1 row, got %', n; END IF;

  -- Nothing else may hang off payment 18 / record 17, or the deletes below would cascade it away.
  SELECT count(*) INTO n FROM "PaymentAllocation" WHERE "paymentId" = 18 OR "interestRecordId" = 17;
  IF n <> 0 THEN RAISE EXCEPTION 'unexpected other allocations on payment 18 / record 17: %', n; END IF;

  DELETE FROM "Payment"
   WHERE id = 18 AND amount = 200 AND "borrowerId" = 8 AND notes = 'Cleared due for August 2026';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Payment 18: expected 1 row, got %', n; END IF;

  DELETE FROM "InterestRecord"
   WHERE id = 17 AND "loanId" = 9 AND "dueDate"::date = DATE '2026-08-20' AND amount = 200;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'InterestRecord 17: expected 1 row, got %', n; END IF;
END $$;
