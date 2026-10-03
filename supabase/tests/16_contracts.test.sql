begin;
select plan(16);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'); -- owner@alpha
select lives_ok($$ insert into contracts (client_id, title, start_date, end_date)
  values ((select id from clients where name = 'Kopi Corner Sdn Bhd'), 'Retainer agreement', '2026-01-01', '2026-12-31') $$,
  'owner can insert a contract');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2'); -- accountant@alpha
select lives_ok($$ insert into contracts (client_id, title, start_date, end_date)
  values ((select id from clients where name = 'Kopi Corner Sdn Bhd'), 'Service agreement', '2026-02-01', '2026-11-30') $$,
  'accountant can insert a contract');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3'); -- viewer@alpha
select throws_ok($$ insert into contracts (client_id, title, start_date, end_date)
  values ((select id from clients where name = 'Kopi Corner Sdn Bhd'), 'Viewer attempt', '2026-01-01', '2026-12-31') $$,
  '42501', null, 'viewer cannot insert a contract');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'); -- owner@alpha
select throws_ok($$ insert into contracts (client_id, title, start_date, end_date)
  values ((select id from clients where name = 'Kopi Corner Sdn Bhd'), 'Bad dates', '2026-12-31', '2026-01-01') $$,
  '23514', null, 'end date must be after start date');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1'); -- owner@beta
select is((select count(*)::int from contracts), 0, 'beta sees no alpha contracts');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2'); -- accountant@alpha
select lives_ok($$ update contracts set counterparty = 'Harbour Foods', end_date = '2027-01-31' where title = 'Retainer agreement' $$,
  'accountant can edit a contract');
select is((select counterparty from contracts where title = 'Retainer agreement'), 'Harbour Foods', 'edit persisted');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3'); -- viewer@alpha
select is_empty($$ update contracts set title = 'Hacked' where title = 'Retainer agreement' returning 1 $$, 'viewer cannot edit a contract');
select is_empty($$ delete from contracts where title = 'Retainer agreement' returning 1 $$, 'viewer cannot delete a contract');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1'); -- owner@beta
select is_empty($$ update contracts set title = 'Hacked' returning 1 $$, 'beta cannot edit alpha contracts');
select is_empty($$ delete from contracts returning 1 $$, 'beta cannot delete alpha contracts');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2'); -- accountant@alpha
select lives_ok($$ delete from contracts where title = 'Service agreement' $$, 'accountant can delete a contract');
select is((select count(*)::int from contracts where title = 'Service agreement'), 0, 'delete persisted');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1'); -- owner@beta, trial still active
select lives_ok($$ insert into contracts (client_id, title, start_date, end_date)
  values ((select id from clients where name = 'Marina Bay Studio Pte Ltd'), 'Beta retainer', '2026-01-01', '2026-12-31') $$,
  'beta owner can insert while trial is active');
reset role;
update firms set trial_ends_at = now() - interval '1 day' where id = '0000000b-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is_empty($$ delete from contracts where title = 'Beta retainer' returning 1 $$, 'delete is blocked when the firm cannot write');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'); -- owner@alpha
select throws_ok($$ insert into contracts (client_id, title, start_date, end_date)
  values ((select id from clients where name = 'Marina Bay Studio Pte Ltd'), 'Cross-firm attempt', '2026-01-01', '2026-12-31') $$,
  'P0001', 'Client must belong to the same firm as the contract.', 'cannot create a contract for another firm''s client');

select * from finish();
rollback;
