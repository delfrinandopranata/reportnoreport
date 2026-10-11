begin;
select plan(44);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set wf 0000000a-0000-0000-0000-00000000c001
\set wf2 0000000a-0000-0000-0000-00000000c002
\set rec 0000000a-0000-0000-0000-00000000d001
\set task 0000000a-0000-0000-0000-00000000e001
\set f3 0000000a-0000-0000-0000-0000000000f3
\set owner 00000000-0000-0000-0000-0000000000a1
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3
\set viewer 00000000-0000-0000-0000-0000000000a4
\set betaowner 00000000-0000-0000-0000-0000000000b1

-- A manager creates a workflow: it starts as an empty draft, access is seeded, the write is audited
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into workflows (id, org_id, name, status, graph) values (%L, %L, 'Trip approval', 'published', '{"nodes":[{"id":"x"}],"edges":[]}') $$, :'wf2', :'alpha'),
  'admin creates a workflow');
select results_eq(format($$ select status, graph from workflows where id = %L $$, :'wf2'),
  $$ values ('draft'::text, '{"nodes":[],"edges":[]}'::jsonb) $$, 'a new workflow is an empty draft whatever the client sends');
select results_eq(format($$ select r.name, wa.can_start, wa.can_view_all from workflow_access wa join roles r on r.id = wa.role_id where wa.workflow_id = %L order by r.name $$, :'wf2'),
  $$ values ('Admin'::text, true, true), ('Member'::text, true, false) $$, 'access is seeded from the roles holding records.start / records.view_all');
select isnt_empty(format($$ select 1 from audit_log where action = 'workflow.create' and target = %L $$, :'wf2'), 'workflow create audited');
select is_empty(format($$ update workflows set name = 'Hacked' where id = %L returning id $$, :'wf2'), 'clients cannot update workflows; save-workflow is the only writer');

-- Members see published workflows only and cannot write them
select pg_temp.act_as(:'member');
select throws_ok(format($$ insert into workflows (org_id, name) values (%L, 'Nope') $$, :'alpha'), '42501', null, 'member cannot create workflows');
select results_eq(format($$ select id::text from workflows where org_id = %L $$, :'alpha'), format($$ values (%L::text) $$, :'wf'),
  'member sees the published workflow, not the draft');
select ok(has_permission(:'alpha'::uuid, 'records.start', :'wf'::uuid), 'member may start the seeded workflow');
select ok((select can_start(w) from workflows w where w.id = :'wf'), 'the can_start computed column agrees');

-- workflow_access narrows records.start; Owners are never narrowed
select pg_temp.act_as(:'admin');
select lives_ok(format($$ delete from workflow_access where workflow_id = %L and role_id = (select id from roles where org_id = %L and name = 'Member') $$, :'wf', :'alpha'),
  'admin removes the Member row');
select isnt_empty(format($$ select 1 from audit_log where action = 'workflow.access' and target = %L $$, :'wf'), 'access change audited');
select pg_temp.act_as(:'member');
select ok(not has_permission(:'alpha'::uuid, 'records.start', :'wf'::uuid), 'without a can_start row the member cannot start it');
select ok(has_permission(:'alpha'::uuid, 'records.start'), 'the org-wide permission is unchanged');
select throws_ok(format($$ insert into workflow_access (workflow_id, org_id, role_id, can_start) select %L, %L, id, true from roles where org_id = %L and name = 'Member' $$, :'wf', :'alpha', :'alpha'),
  '42501', null, 'member cannot grant themselves access');
select pg_temp.act_as(:'owner');
select ok(has_permission(:'alpha'::uuid, 'records.start', :'wf'::uuid), 'an Owner is never narrowed');
select pg_temp.act_as(:'viewer');
select ok(not has_permission(:'alpha'::uuid, 'records.view_all', :'wf'::uuid), 'viewer cannot view all records');

-- Record visibility: starter, view_all, holder of an open role task
reset role;
insert into records (id, org_id, workflow_id, title, current_node_id, started_by) values (:'rec', :'alpha', :'wf', 'Leave approval: Ada', 'approve', :'member');
insert into tasks (id, org_id, record_id, node_id, assignee_role_id)
values (:'task', :'alpha', :'rec', 'approve', (select id from roles where org_id = :'alpha' and name = 'Viewer'));
select pg_temp.act_as(:'member');
select isnt_empty(format($$ select 1 from records where id = %L $$, :'rec'), 'the starter sees their record');
select pg_temp.act_as(:'admin');
select isnt_empty(format($$ select 1 from records where id = %L $$, :'rec'), 'records.view_all with a can_view_all row sees every record');
select pg_temp.act_as(:'viewer');
select isnt_empty(format($$ select 1 from records where id = %L $$, :'rec'), 'a holder of the open task''s role sees the record');
select ok((select is_mine(t) from tasks t where t.id = :'task'), 'the role task is in the viewer''s inbox');
select lives_ok(format($$ select claim_task(%L) $$, :'task'), 'viewer claims the role task');
select throws_ok(format($$ select claim_task(%L) $$, :'task'), 'P0001', 'This task was already claimed or completed.', 'a second claim is refused');
select pg_temp.act_as(:'member');
select throws_ok(format($$ select claim_task(%L) $$, :'task'), '42501', null, 'only holders of the task''s role can claim it');
select throws_ok(format($$ insert into records (org_id, workflow_id, title, started_by) values (%L, %L, 'x', auth.uid()) $$, :'alpha', :'wf'),
  '42501', null, 'clients cannot insert records');
select throws_ok(format($$ insert into tasks (org_id, record_id, node_id, assignee_user_id) values (%L, %L, 'approve', auth.uid()) $$, :'alpha', :'rec'),
  '42501', null, 'clients cannot insert tasks');
select throws_ok(format($$ insert into scheduled_actions (org_id, record_id, resume_node_id, run_at, state_at_schedule) values (%L, %L, 'wait', now(), 0) $$, :'alpha', :'rec'),
  '42501', null, 'clients cannot insert scheduled actions');

-- Another org sees nothing
select pg_temp.act_as(:'betaowner');
select is_empty(format($$ select 1 from records where org_id = %L $$, :'alpha'), 'beta owner reads no alpha records');
select is_empty(format($$ select 1 from tasks where org_id = %L $$, :'alpha'), 'beta owner reads no alpha tasks');
select is_empty(format($$ select 1 from workflows where org_id = %L $$, :'alpha'), 'beta owner reads no alpha workflows');
select ok(not has_permission(:'alpha'::uuid, 'records.start', :'wf'::uuid), 'beta owner cannot start an alpha workflow');

-- Submissions on a record: one per task, the step is named, the starter can read them
reset role;
insert into form_submissions (org_id, form_id, answers, submitted_by, record_id, node_id, task_id, outcome)
values (:'alpha', :'f3', '{}', :'viewer', :'rec', 'approve', :'task', 'approved');
select throws_ok(format($$ insert into form_submissions (org_id, form_id, answers, submitted_by, record_id, node_id, task_id, outcome) values (%L, %L, '{}', %L, %L, 'approve', %L, 'approved') $$, :'alpha', :'f3', :'admin', :'rec', :'task'),
  '23505', null, 'a task takes one submission, so a double approval cannot both land');
select throws_ok(format($$ insert into form_submissions (org_id, form_id, answers, submitted_by, record_id) values (%L, %L, '{}', %L, %L) $$, :'alpha', :'f3', :'admin', :'rec'),
  '23514', null, 'a workflow submission names its step');
select throws_ok(format($$ insert into tasks (org_id, record_id, node_id, assignee_user_id) values (%L, %L, 'approve', %L) $$, :'alpha', :'rec', :'admin'),
  '23505', null, 'a record has at most one open task');
select pg_temp.act_as(:'member');
select isnt_empty(format($$ select 1 from form_submissions where record_id = %L $$, :'rec'), 'the starter reads every submission on their record');

-- Node-deletion guard
reset role;
select throws_ok(format($$ update workflows set graph = '{"nodes":[],"edges":[]}' where id = %L $$, :'wf'),
  'P0001', 'A step with open records cannot be deleted: approve (1 open)', 'a step with an open record cannot be deleted');
select lives_ok(format($$ update workflows set graph = jsonb_set(graph, '{nodes}', (select jsonb_agg(n) from jsonb_array_elements(graph->'nodes') n where n->>'id' <> 'wait')) where id = %L $$, :'wf'),
  'other steps can still be deleted');
select pg_temp.act_as(:'admin');
select results_eq(format($$ select node_id, n from open_record_counts(%L) $$, :'wf'), $$ values ('approve'::text, 1) $$, 'managers see open records per step');
select pg_temp.act_as(:'member');
select throws_ok(format($$ select * from open_record_counts(%L) $$, :'wf'), '42501', null, 'only workflow managers see the counts');
select pg_temp.act_as(:'admin');
select throws_ok(format($$ delete from workflows where id = %L $$, :'wf'), '23503', null, 'a workflow with records cannot be deleted');

-- Claims are audited; the resume job is scheduled
reset role;
select isnt_empty(format($$ select 1 from audit_log where action = 'task.claim' and target = %L $$, :'task'), 'task claim audited');
select isnt_empty($$ select 1 from cron.job where jobname = 'resume-workflows' and schedule = '* * * * *' $$, 'resume job runs every minute');

-- Only open records pin a step: an errored record cannot be cleared in Phase 3, so it must not block deletion.
insert into records (org_id, workflow_id, title, current_node_id, status, error, started_by)
  values (:'alpha', :'wf', 'Stopped', 'long', 'error', 'Enter the status text.', :'member');
select lives_ok(format($$ update workflows set graph = jsonb_set(graph, '{nodes}', (select jsonb_agg(n) from jsonb_array_elements(graph->'nodes') n where n->>'id' <> 'long')) where id = %L $$, :'wf'),
  'a step with only an error record can be deleted');
select pg_temp.act_as(:'admin');
select results_eq(format($$ select node_id, n from open_record_counts(%L) $$, :'wf'), $$ values ('approve'::text, 1) $$, 'error records are not counted as open');
reset role;
update records set status = 'open' where title = 'Stopped';
select throws_ok(format($$ update workflows set graph = jsonb_set(graph, '{nodes}', (select jsonb_agg(n) from jsonb_array_elements(graph->'nodes') n where n->>'id' <> 'long')) where id = %L $$, :'wf'),
  'P0001', null, 'the same record, once open, blocks deleting its step');

select * from finish();
rollback;
