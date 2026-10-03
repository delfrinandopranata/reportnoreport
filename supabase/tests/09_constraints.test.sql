begin;
select plan(10);

select throws_ok(
  $$ update profiles set firm_id = '0000000a-0000-0000-0000-000000000001' where user_id = '00000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'super admin cannot belong to a firm');

-- A firm may deliberately record an underpayment/overpayment/correction as a negative
-- or zero amount — only the magnitude cap (overflow protection, not a business rule) is
-- still enforced.
select lives_ok(
  $$ insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
     values ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', -500, current_date) $$,
  'a negative amount is allowed');

select lives_ok(
  $$ insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
     values ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 0, current_date) $$,
  'a zero amount is allowed');

select throws_ok(
  $$ insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
     values ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 10000000000001, current_date) $$,
  '23514', null, 'amount still cannot exceed the magnitude cap');

select throws_ok(
  $$ update profiles set email = 'OWNER@ALPHA.TEST' where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '23505', null, 'profile email is unique case-insensitively');

select throws_ok(
  $$ delete from bank_accounts where id = '0000000a-0000-0000-0000-0000000000ba' $$,
  '23503', null, 'bank account with transactions cannot be deleted');

delete from clients where id = '0000000a-0000-0000-0000-0000000000c1';
select is(
  (select count(*)::int from transactions where client_id = '0000000a-0000-0000-0000-0000000000c1'),
  0, 'deleting a client removes its transactions');
select is(
  (select count(*)::int from change_log where table_name = 'transactions' and action = 'delete'
     and (before->>'client_id') = '0000000a-0000-0000-0000-0000000000c1'),
  4, 'change_log keeps the deleted transaction rows');

update clients set created_at = '2000-01-01', created_by = '00000000-0000-0000-0000-0000000000a1'
 where id = '0000000a-0000-0000-0000-0000000000c2';
select ok(
  (select created_at > '2020-01-01' from clients where id = '0000000a-0000-0000-0000-0000000000c2'),
  'created_at cannot be rewritten');
select is(
  (select created_by from clients where id = '0000000a-0000-0000-0000-0000000000c2'),
  null, 'created_by cannot be rewritten');

select * from finish();
rollback;
