begin;
select plan(6);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2'); -- accountant
select throws_ok($$ select change_member_role((select id from profiles where email = 'viewer@alpha.test'), 'admin') $$,
  'P0001', 'Your role can''t manage users.', 'accountant cannot change roles');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4'); -- admin
select throws_ok($$ select suspend_member((select id from profiles where email = 'owner@alpha.test')) $$,
  'P0001', 'Only the owner can change the owner.', 'admin cannot suspend the owner');
select lives_ok($$ select change_member_role((select id from profiles where email = 'viewer@alpha.test'), 'accountant') $$,
  'admin can change a viewer to accountant');
select throws_ok($$ select change_member_role((select id from profiles where email = 'viewer@alpha.test'), 'owner') $$,
  'P0001', 'Use Transfer ownership to make someone the owner.', 'owner role only via transfer');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'); -- owner
select lives_ok($$ select transfer_ownership((select id from profiles where email = 'admin@alpha.test')) $$, 'owner transfers ownership');
reset role;
select is((select role::text from profiles where email = 'owner@alpha.test'), 'admin', 'previous owner becomes admin');

select * from finish();
rollback;
