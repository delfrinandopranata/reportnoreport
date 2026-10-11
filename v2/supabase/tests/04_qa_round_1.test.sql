begin;
select plan(12);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001

-- Setup as superuser: admin also becomes Owner; member holds only members.manage.
reset role;
insert into member_roles select m.id, r.id from members m join roles r on r.org_id = m.org_id and r.is_owner
  where m.email = 'admin@alpha.test';
insert into roles (id, org_id, name) values ('0000000a-0000-0000-0000-00000000bb01', :'alpha', 'MemMgr');
insert into role_permissions values ('0000000a-0000-0000-0000-00000000bb01', 'members.manage');
delete from member_roles where member_id = (select id from members where email = 'member@alpha.test');
insert into member_roles select id, '0000000a-0000-0000-0000-00000000bb01' from members where email = 'member@alpha.test';

-- QA-1: only an Owner may remove an Owner
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select remove_member((select id from members where email = 'admin@alpha.test')) $$,
  'P0001', 'Only an Owner can remove an Owner.', 'QA-1 non-Owner cannot remove an Owner');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select remove_member((select id from members where email = 'admin@alpha.test')) $$, 'QA-1 Owner can remove another Owner');

-- QA-5: helpers not callable by clients
select throws_ok(format($$ select owner_count(%L) $$, :'alpha'), '42501', null, 'QA-5 owner_count denied');
select throws_ok(format($$ select require_permission(%L, 'roles.manage') $$, :'alpha'), '42501', null, 'QA-5 require_permission denied');

-- QA-6: null / duplicate role ids give a friendly error
select throws_ok($$ select set_member_roles((select id from members where email = 'viewer@alpha.test'), array[null::uuid]) $$,
  'P0001', 'Invalid roles.', 'QA-6 null role id rejected');
select throws_ok(format($$ select set_member_roles((select id from members where email = 'viewer@alpha.test'), array[%L::uuid, %L::uuid]) $$,
  '0000000a-0000-0000-0000-00000000bb01', '0000000a-0000-0000-0000-00000000bb01'),
  'P0001', 'Invalid roles.', 'QA-6 duplicate role id rejected');

-- QA-7: audit gaps
update orgs set name = 'Alpha Renamed' where id = :'alpha';
select isnt_empty($$ select 1 from audit_log where action = 'org.rename' and after->>'name' = 'Alpha Renamed' $$, 'QA-7 org rename audited');

select save_role(:'alpha', null, 'Temp', array['reports.view']);
select set_member_roles((select id from members where email = 'viewer@alpha.test'),
  array[(select id from roles where org_id = :'alpha' and name = 'Temp')]);
select delete_role((select id from roles where org_id = :'alpha' and name = 'Temp'));
select results_eq($$ select jsonb_array_length(before->'members') from audit_log where action = 'role.delete' and before->>'name' = 'Temp' $$,
  array[1], 'QA-7 role delete records affected members');

reset role;
insert into members (org_id, email, status) values (:'alpha', 'newbie@alpha.test', 'invited');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'newbie@alpha.test', now(), now());
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(accept_invites(), 1, 'QA-7 accept_invites activates');
reset role;
select isnt_empty($$ select 1 from audit_log where action = 'member.accept' and after->>'email' = 'newbie@alpha.test' $$, 'QA-7 invite acceptance audited');

select is((select status from members where email = 'newbie@alpha.test'), 'active', 'invited member now active');
select results_eq($$ select count(*)::int from audit_log where action = 'org.rename' $$, array[1], 'rename audited exactly once');

select * from finish();
rollback;
