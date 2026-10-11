-- 20261007000005 dropped `> 0` to allow negative corrections; zero is still never a valid amount.
-- NOT VALID: enforced on every new and updated row without scanning (or failing on) existing data.
-- Run `alter table transactions validate constraint transactions_amount_minor_nonzero` once any legacy zero rows are reviewed.
alter table transactions add constraint transactions_amount_minor_nonzero check (amount_minor <> 0) not valid;
