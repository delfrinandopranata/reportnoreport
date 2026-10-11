begin;
select plan(14);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001

-- create_org seeds four roles and makes the caller Owner
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok($$ select create_org('Member Own Org') $$, 'any user can create an org');
select results_eq($$ select count(*)::int from roles r join orgs o on o.id = r.org_id where o.name = 'Member Own Org' $$, array[4], 'four roles seeded');

-- Member cannot manage roles
select throws_ok(format($$ select save_role(%L, null, 'Hacker', array['roles.manage']) $$, :'alpha'), '42501', null, 'member cannot create roles');

-- Admin can create a role with permissions it holds
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(format($$ select save_role(%L, null, 'Counsellor', array['records.start','reports.view']) $$, :'alpha'), 'admin creates role');
select isnt_empty($$ select 1 from audit_log where action = 'role.create' and after->>'name' = 'Counsellor' $$, 'role create audited');

-- Owner role is immutable
select throws_ok(format($$ select save_role(%L, (select id from roles where org_id = %L and is_owner), 'Boss', array[]::text[]) $$, :'alpha', :'alpha'),
  'P0001', 'The Owner role cannot be changed.', 'owner role immutable');
select throws_ok(format($$ select delete_role((select id from roles where org_id = %L and is_owner)) $$, :'alpha'),
  'P0001', 'The Owner role cannot be deleted.', 'owner role undeletable');

-- Cannot grant what you lack: make a role-manager without members.manage
reset role;
insert into roles (id, org_id, name) values ('0000000a-0000-0000-0000-00000000aa01', :'alpha', 'RoleMgr');
insert into role_permissions values ('0000000a-0000-0000-0000-00000000aa01', 'roles.manage');
delete from member_roles where member_id = (select id from members where email = 'viewer@alpha.test');
insert into member_roles select id, '0000000a-0000-0000-0000-00000000aa01' from members where email = 'viewer@alpha.test';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(format($$ select save_role(%L, null, 'Escalate', array['members.manage']) $$, :'alpha'),
  'P0001', 'You cannot grant permissions you do not hold: members.manage', 'no escalation via save_role');

-- Last Owner guard
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select set_member_roles((select id from members where email = 'owner@alpha.test'), array[]::uuid[]) $$,
  'P0001', 'An organisation needs at least one Owner.', 'last owner cannot drop Owner');
select throws_ok($$ select remove_member((select id from members where email = 'owner@alpha.test')) $$,
  'P0001', 'An organisation needs at least one Owner.', 'last owner cannot be removed');

-- Only an Owner can assign the Owner role
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(format($$ select set_member_roles((select id from members where email = 'member@alpha.test'), array[(select id from roles where org_id = %L and is_owner)]) $$, :'alpha'),
  'P0001', 'Only an Owner can assign the Owner role.', 'admin cannot make owners');

-- Removed member loses access immediately
select lives_ok($$ select remove_member((select id from members where email = 'member@alpha.test')) $$, 'admin removes member');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select ok(not has_permission(:'alpha', 'records.start'), 'removed member has no permissions');
select throws_ok(format($$ select save_role(%L, null, 'X', array[]::text[]) $$, :'alpha'), '42501', null, 'removed member blocked from RPCs');

select * from finish();
rollback;
