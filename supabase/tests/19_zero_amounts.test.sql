begin;
select plan(4);

select throws_ok($$ insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
  values ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 0, current_date) $$,
  '23514', null, 'zero is rejected on insert');
select lives_ok($$ insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
  values ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', -500, current_date) $$, 'negative corrections are allowed');
select lives_ok($$ insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date)
  values ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'payment', 500, current_date) $$, 'positive is allowed');
select throws_ok($$ update transactions set amount_minor = 0 where client_id = '0000000a-0000-0000-0000-0000000000c1' $$, '23514', null, 'zero is rejected on update');

select * from finish();
rollback;
