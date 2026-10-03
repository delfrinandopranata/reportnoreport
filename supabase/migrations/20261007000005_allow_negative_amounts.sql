-- Deliberate product decision: firms need full freedom when recording a transaction —
-- a client who underpaid, overpaid, or a correction, are all recorded as a negative
-- receipt/payment rather than forcing a separate "adjustment" concept. The amount's
-- correctness, sign, and whether it's "wrong" is entirely the firm's judgement; this
-- app does not referee it. The magnitude cap stays — it is a pure overflow/display
-- safety rail (money is always a bigint minor-unit value), not a business rule.
-- The constraint's auto-generated name is looked up rather than assumed, so this
-- doesn't depend on exactly how Postgres named it when the column was first created.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
    where conrelid = 'transactions'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%amount_minor%';
  execute format('alter table transactions drop constraint %I', v_name);
end $$;

alter table transactions add constraint transactions_amount_minor_check
  check (amount_minor >= -10000000000000 and amount_minor <= 10000000000000);
