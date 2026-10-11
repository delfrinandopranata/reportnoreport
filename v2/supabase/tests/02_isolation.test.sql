begin;
select plan(9);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Fixture: org A with u1 holding a role that has reports.view; org B with u2.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f001', 'u1@a.test'), ('00000000-0000-0000-0000-00000000f002', 'u2@b.test');
insert into orgs (id, name) values ('00000000-0000-0000-0000-00000000fa00', 'A'), ('00000000-0000-0000-0000-00000000fb00', 'B');
insert into members (id, org_id, user_id, email, status) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fa00', '00000000-0000-0000-0000-00000000f001', 'u1@a.test', 'active'),
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fb00', '00000000-0000-0000-0000-00000000f002', 'u2@b.test', 'active');
insert into roles (id, org_id, name) values ('00000000-0000-0000-0000-00000000fa10', '00000000-0000-0000-0000-00000000fa00', 'Reader');
insert into role_permissions values ('00000000-0000-0000-0000-00000000fa10', 'reports.view');
insert into member_roles values ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000fa10');
insert into audit_log (org_id, action, target) values ('00000000-0000-0000-0000-00000000fb00', 'x', 'y');

select pg_temp.act_as('00000000-0000-0000-0000-00000000f001');
select ok(is_member('00000000-0000-0000-0000-00000000fa00'), 'u1 is a member of A');
select ok(not is_member('00000000-0000-0000-0000-00000000fb00'), 'u1 is not a member of B');
select ok(has_permission('00000000-0000-0000-0000-00000000fa00', 'reports.view'), 'u1 has reports.view in A');
select ok(not has_permission('00000000-0000-0000-0000-00000000fa00', 'roles.manage'), 'u1 lacks roles.manage');
select results_eq($$ select * from my_permissions('00000000-0000-0000-0000-00000000fa00') $$, array['reports.view'], 'my_permissions lists held keys');
select is_empty($$ select id from orgs where id = '00000000-0000-0000-0000-00000000fb00' $$, 'cannot see org B');
select is_empty($$ select id from members where org_id = '00000000-0000-0000-0000-00000000fb00' $$, 'cannot see B members');
select is_empty($$ select id from audit_log where org_id = '00000000-0000-0000-0000-00000000fb00' $$, 'cannot see B audit log');
select is_empty($$ select id from audit_log where org_id = '00000000-0000-0000-0000-00000000fa00' $$, 'audit log needs roles.manage or members.manage');

select * from finish();
rollback;
