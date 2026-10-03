begin;
select plan(7);

-- As postgres (bypasses RLS) to test the constraints themselves.
select throws_ok(
  $$ update firms set currency = 'USD' where id = '0000000a-0000-0000-0000-000000000001' $$,
  'P0001', 'The firm currency can''t change once transactions exist.', 'currency locked once transactions exist');

select throws_ok(
  $$ insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
     values ('0000000a-0000-0000-0000-000000000001', '0000000b-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 1, current_date) $$,
  'P0001', 'Client and bank account must belong to the same firm as the transaction.', 'cross-firm client rejected');

select throws_ok(
  $$ update profiles set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000a4' $$,
  '23505', null, 'only one owner per firm');

select throws_ok(
  $$ insert into bank_accounts (firm_id, name, is_default) values ('0000000a-0000-0000-0000-000000000001', 'Second', true) $$,
  '23505', null, 'only one default bank account per firm');

update clients set notes = 'audited' where id = '0000000a-0000-0000-0000-0000000000c1';
select is(
  (select after->>'notes' from change_log where row_id = '0000000a-0000-0000-0000-0000000000c1' and action = 'update' order by at desc limit 1),
  'audited', 'updates are written to change_log');

delete from transactions where description = 'Top-up';
select isnt(
  (select before->>'description' from change_log where table_name = 'transactions' and action = 'delete' order by at desc limit 1),
  null, 'deleted rows are kept in change_log');

-- As the alpha owner, billing columns are protected.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ update firms set billing_status = 'paid' $$,
  'P0001', 'Billing details can only be changed by the platform.', 'firm users cannot change billing');

select * from finish();
rollback;
