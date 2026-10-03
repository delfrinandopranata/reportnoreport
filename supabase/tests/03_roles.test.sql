begin;
select plan(8);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3'); -- viewer
select throws_ok($$ insert into clients (name) values ('V') $$, '42501', null, 'viewer cannot add clients');
select is_empty($$ update firms set trading_name = 'x' returning id $$, 'viewer cannot edit settings');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2'); -- accountant
select lives_ok($$ insert into clients (name) values ('Acct Co') $$, 'accountant can add clients (firm_id defaults)');
select lives_ok(
  $$ insert into transactions (client_id, bank_account_id, kind, amount_minor, date)
     values ('0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 100, current_date) $$,
  'accountant can post transactions');
select is_empty($$ delete from clients where id = '0000000a-0000-0000-0000-0000000000c2' returning id $$, 'accountant cannot delete clients');
select is_empty($$ update firms set trading_name = 'x' returning id $$, 'accountant cannot edit settings');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4'); -- admin
select isnt_empty($$ update firms set trading_name = 'Alpha' returning id $$, 'admin can edit settings');
select ok(not auth_can('billing.pay'), 'admin cannot pay');

select * from finish();
rollback;
