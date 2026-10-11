begin;
select plan(40);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set wf 0000000a-0000-0000-0000-00000000c001
\set rec 0000000a-0000-0000-0000-00000000d0f1
\set rec2 0000000a-0000-0000-0000-00000000d0f2
\set rep 0000000a-0000-0000-0000-00000000e0f1
\set wid 0000000a-0000-0000-0000-00000000e0f2
\set wid2 0000000a-0000-0000-0000-00000000e0f3
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3
\set viewer 00000000-0000-0000-0000-0000000000a4
\set betaowner 00000000-0000-0000-0000-0000000000b1

reset role;
delete from report_templates where workflow_id = :'wf'; -- the seed adds a template and widgets; this file builds its own
delete from dashboard_widgets where org_id = :'alpha';
insert into records (id, org_id, workflow_id, title, current_node_id, status, started_by)
values (:'rec', :'alpha', :'wf', 'Leave approval: Test', null, 'done', :'member'),
       (:'rec2', :'alpha', :'wf', 'Leave approval: Admin', null, 'done', :'admin');

-- PDF request without a template is refused with a sentence
select pg_temp.act_as(:'member');
select throws_ok(format($$ select request_record_pdf(%L) $$, :'rec'), 'P0001', 'This workflow has no report template yet.', 'no template, no PDF');

-- Report templates: reports.view reads, reports.manage writes, Beta sees nothing
select throws_ok(format($$ insert into report_templates (org_id, workflow_id, header) values (%L, %L, 'x') $$, :'alpha', :'wf'),
  '42501', null, 'a member cannot create a report template');
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into report_templates (org_id, workflow_id, header, fields, signoff)
  values (%L, %L, 'Leave record', '[{"nodeId":"start","key":"name"}]', '["approve"]') $$, :'alpha', :'wf'), 'reports.manage creates a template');
select isnt_empty(format($$ select 1 from audit_log where action = 'report_template.create' and org_id = %L $$, :'alpha'), 'template create audited');
select throws_ok(format($$ insert into report_templates (org_id, workflow_id) values (%L, %L) $$, :'alpha', :'wf'),
  '23505', null, 'one template per workflow');
select throws_ok(format($$ update report_templates set org_id = %L where workflow_id = %L $$, :'beta', :'wf'), '42501', null, 'a template cannot move org');
select pg_temp.act_as(:'member');
select is((select count(*)::int from report_templates where workflow_id = :'wf'), 1, 'reports.view reads the template');
select is_empty(format($$ update report_templates set header = 'x' where workflow_id = %L returning id $$, :'wf'), 'a member cannot edit it');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from report_templates where org_id = :'alpha'), 0, 'beta reads no alpha templates');
select is_empty(format($$ update report_templates set header = 'x' where org_id = %L returning id $$, :'alpha'), 'beta cannot edit alpha templates');

-- PDF jobs: who may request, one queued job per record, visibility of the job rows
select pg_temp.act_as(:'member');
select isnt(request_record_pdf(:'rec'), null::uuid, 'the starter requests a PDF');
select is(request_record_pdf(:'rec'), (select id from record_pdfs where record_id = :'rec' and status = 'queued'), 'a second request returns the queued job');
select is((select count(*)::int from record_pdfs where record_id = :'rec'), 1, 'still one job');
reset role; -- members cannot read audit_log
select isnt_empty(format($$ select 1 from audit_log where action = 'record.pdf_request' and target = %L $$, :'rec'), 'request audited');
select pg_temp.act_as(:'member');
select throws_ok(format($$ select request_record_pdf(%L) $$, :'rec2'), '42501', null, 'a member cannot request a PDF for a record they cannot see');
select is((select count(*)::int from record_pdfs where record_id = :'rec2'), 0, 'and cannot see its jobs');
select throws_ok(format($$ insert into record_pdfs (org_id, record_id) values (%L, %L) $$, :'alpha', :'rec'), '42501', null, 'clients cannot queue jobs directly');
select pg_temp.act_as(:'viewer');
select throws_ok(format($$ select request_record_pdf(%L) $$, :'rec'), '42501', null, 'a viewer who cannot see the record cannot request');
select pg_temp.act_as(:'admin');
select isnt(request_record_pdf(:'rec2'), null::uuid, 'records.view_all requests any record');
select pg_temp.act_as(:'betaowner');
select throws_ok(format($$ select request_record_pdf(%L) $$, :'rec'), '42501', null, 'beta cannot request an alpha PDF');
select is((select count(*)::int from record_pdfs), 0, 'beta reads no alpha jobs');

-- PDF objects: readable exactly where the record is visible, never across orgs
reset role;
insert into storage.objects (bucket_id, name) values
  ('record-pdfs', :'alpha' || '/' || :'rec' || '/a.pdf'),
  ('record-pdfs', :'beta' || '/' || :'rec' || '/forged.pdf');
select pg_temp.act_as(:'member');
select results_eq($$ select name from storage.objects where bucket_id = 'record-pdfs' $$,
  format($$ values (%L::text) $$, :'alpha' || '/' || :'rec' || '/a.pdf'), 'the starter reads the PDF, not a forged org path');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('record-pdfs', %L) $$, :'alpha' || '/' || :'rec' || '/b.pdf'),
  '42501', null, 'clients cannot upload PDFs');
select pg_temp.act_as(:'viewer');
select is_empty($$ select 1 from storage.objects where bucket_id = 'record-pdfs' $$, 'a viewer who cannot see the record cannot read its PDF');
select pg_temp.act_as(:'betaowner');
select is_empty($$ select 1 from storage.objects where bucket_id = 'record-pdfs' $$, 'beta reads no alpha PDF');

-- Saved reports: reports.view reads, reports.manage writes
select pg_temp.act_as(:'member');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns) values (%L, %L, 'x', '[{"meta":"title"}]') $$, :'alpha', :'wf'),
  '42501', null, 'a member cannot save a report');
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into saved_reports (id, org_id, workflow_id, name, columns, group_by, aggregate)
  values (%L, %L, %L, 'Leave by type', '[{"field":"leave_type"}]', '{"field":"leave_type"}', '{"fn":"count"}') $$, :'rep', :'alpha', :'wf'),
  'reports.manage saves a report');
select isnt_empty(format($$ select 1 from audit_log where action = 'report.create' and target = %L $$, :'rep'), 'report save audited');
select pg_temp.act_as(:'viewer');
select is((select count(*)::int from saved_reports where id = :'rep'), 1, 'reports.view reads saved reports');
select is_empty(format($$ delete from saved_reports where id = %L returning id $$, :'rep'), 'reports.view cannot delete them');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from saved_reports where org_id = :'alpha'), 0, 'beta reads no alpha reports');

-- Widgets and the layout RPC
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into dashboard_widgets (id, org_id, report_id, kind, title, span, position) values
  (%L, %L, %L, 'number', 'Leave records', 1, 1), (%L, %L, %L, 'bar', 'By type', 2, 2) $$,
  :'wid', :'alpha', :'rep', :'wid2', :'alpha', :'rep'), 'reports.manage adds widgets');
select lives_ok(format($$ select save_dashboard_layout(%L, %L::jsonb, %s) $$, :'alpha',
  json_build_array(json_build_object('id', :'wid2', 'span', 4), json_build_object('id', :'wid', 'span', 1))::text, (select version from dashboard_versions where org_id = :'alpha')), 'reports.manage saves a layout');
select results_eq(format($$ select id::text, span, position from dashboard_widgets where org_id = %L order by position $$, :'alpha'),
  format($$ values (%L::text, 4, 1), (%L::text, 1, 2) $$, :'wid2', :'wid'), 'order and widths applied');
select isnt_empty(format($$ select 1 from audit_log where action = 'dashboard.layout' and org_id = %L $$, :'alpha'), 'layout audited');
select throws_ok(format($$ select save_dashboard_layout(%L, %L::jsonb, %s) $$, :'alpha', json_build_array(json_build_object('id', :'wid', 'span', 1))::text, (select version from dashboard_versions where org_id = :'alpha')),
  'P0001', 'The dashboard changed. Reload to see the latest layout.', 'a stale layout is refused');
select pg_temp.act_as(:'member');
select is((select count(*)::int from dashboard_widgets where org_id = :'alpha'), 2, 'reports.view sees the dashboard');
select throws_ok(format($$ select save_dashboard_layout(%L, '[]'::jsonb, 0) $$, :'alpha'), '42501', null, 'a member cannot change the layout');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from dashboard_widgets where org_id = :'alpha'), 0, 'beta sees no alpha widgets');

-- The worker's wake-up
reset role;
select isnt_empty($$ select 1 from cron.job where jobname = 'render-pdfs' $$, 'the render-pdfs cron job exists');

select * from finish();
rollback;
