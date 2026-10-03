begin;
select plan(5);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ insert into clients (name) values ('During trial') $$, 'trial firm can write');

reset role;
update firms set trial_ends_at = now() - interval '1 day' where id = '0000000b-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ insert into clients (name) values ('After trial') $$, '42501', null, 'expired trial cannot write');
select is((select count(*)::int from clients), 2, 'expired trial can still read');
select matches(firm_write_block_reason('0000000b-0000-0000-0000-000000000001'), '^The free trial ended on ', 'reason names the trial end');

reset role;
update firms set status = 'suspended' where id = '0000000a-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from clients), 0, 'suspended firm sees nothing');

select * from finish();
rollback;
