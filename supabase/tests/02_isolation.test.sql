begin;
select plan(6);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from clients), 2, 'alpha owner sees alpha clients only');
select is((select count(*)::int from firms), 1, 'alpha owner sees one firm');
select is((select count(*)::int from transactions where firm_id = '0000000b-0000-0000-0000-000000000001'), 0, 'alpha owner cannot read beta transactions');

reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from clients), 1, 'beta owner sees beta clients only');
select throws_ok(
  $$ insert into clients (firm_id, name) values ('0000000a-0000-0000-0000-000000000001', 'Sneaky') $$,
  '42501', null, 'beta owner cannot insert into alpha');
select is_empty(
  $$ update clients set name = 'Hijack' where id = '0000000a-0000-0000-0000-0000000000c1' returning id $$,
  'beta owner cannot update alpha rows');

select * from finish();
rollback;
