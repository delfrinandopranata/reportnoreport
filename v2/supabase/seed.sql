-- Users
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email,
       crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'member@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'viewer@alpha.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@beta.test')
) u(id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), id, id::text, json_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users;

-- Orgs are created through the RPC so seeding exercises the real path.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select create_org('Alpha School', '0000000a-0000-0000-0000-000000000001');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select create_org('Beta HR', '0000000b-0000-0000-0000-000000000001');

-- Alpha members with one system role each.
insert into members (org_id, user_id, email, status)
values ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin@alpha.test', 'active'),
       ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'member@alpha.test', 'active'),
       ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'viewer@alpha.test', 'active');
insert into member_roles (member_id, role_id)
select m.id, r.id from members m join roles r on r.org_id = m.org_id
where m.org_id = '0000000a-0000-0000-0000-000000000001'
  and (m.email, r.name) in (('admin@alpha.test','Admin'), ('member@alpha.test','Member'), ('viewer@alpha.test','Viewer'));

-- A sample form for browser checks (Phase 2).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into forms (id, org_id, name, schema) values ('0000000a-0000-0000-0000-0000000000f1', '0000000a-0000-0000-0000-000000000001', 'Leave request', $json$[
  {"key":"name","type":"short_text","label":"Full name","required":true},
  {"key":"reason","type":"long_text","label":"Reason"},
  {"key":"leave_type","type":"single_select","label":"Leave type","required":true,"options":["Annual","Medical","Other"]},
  {"key":"other_reason","type":"short_text","label":"Other reason","required":true,"show_if":{"field":"leave_type","operator":"is","value":"Other"}},
  {"key":"mc","type":"file","label":"Medical certificate","required":true,"show_if":{"field":"leave_type","operator":"is","value":"Medical"}},
  {"key":"p2","type":"page_break","label":"Dates"},
  {"key":"start","type":"date","label":"First day","required":true},
  {"key":"end","type":"date","label":"Last day","required":true},
  {"key":"days","type":"calculated","label":"Days","expression":"days_between(start, end) + 1"},
  {"key":"cover","type":"multi_select","label":"Cover arranged with","options":["Team lead","Peer"]},
  {"key":"p3","type":"page_break","label":"Expenses"},
  {"key":"claims","type":"group","label":"Claims","repeat":{"min":0,"max":3},"fields":[
    {"key":"item","type":"short_text","label":"Item","required":true},
    {"key":"amount","type":"number","label":"Amount","required":true}]},
  {"key":"total","type":"calculated","label":"Total claimed","expression":"sum(claims[].amount)"},
  {"key":"agree","type":"checkbox","label":"I confirm these details are true","required":true},
  {"key":"sig","type":"signature","label":"Signature","required":true}
]$json$);
-- Phase 3: an approval form and a published "Leave approval" workflow (same shape as _shared/workflow/fixture.ts).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into forms (id, org_id, name, schema) values ('0000000a-0000-0000-0000-0000000000f3', '0000000a-0000-0000-0000-000000000001', 'Manager approval',
  '[{"key":"comment","type":"long_text","label":"Comment"}]');
insert into workflows (id, org_id, name) values ('0000000a-0000-0000-0000-00000000c001', '0000000a-0000-0000-0000-000000000001', 'Leave approval');
update workflows set status = 'published', updated_by = '00000000-0000-0000-0000-0000000000a1', graph = replace(replace($json${
  "nodes": [
    {"id":"start","type":"start","formId":"0000000a-0000-0000-0000-0000000000f1","position":{"x":0,"y":0}},
    {"id":"approve","type":"form","label":"Manager approval","formId":"0000000a-0000-0000-0000-0000000000f3","assignee":{"role":"ROLE_ADMIN"},"mode":"approve","due":{"amount":2,"unit":"days"},"position":{"x":240,"y":0}},
    {"id":"long","type":"condition","label":"More than 2 days?","rule":{"field":"days","operator":"gt","value":2},"position":{"x":480,"y":0}},
    {"id":"wait","type":"time","label":"Wait a minute","after":{"amount":1,"unit":"minutes"},"position":{"x":720,"y":0}},
    {"id":"done","type":"end","label":"Approved","status":"done","position":{"x":960,"y":0}},
    {"id":"rejected","type":"end","label":"Rejected","status":"rejected","position":{"x":480,"y":160}}
  ],
  "edges": [
    {"id":"e1","from":"start","outcome":"submitted","to":"approve","actions":[]},
    {"id":"e2","from":"approve","outcome":"approved","to":"long","actions":[{"type":"send_message","templateId":"TPL_APPROVED","recipients":[{"starter":true}]}]},
    {"id":"e3","from":"approve","outcome":"rejected","to":"rejected","actions":[{"type":"set_status","label":"Rejected by manager"}]},
    {"id":"e4","from":"long","outcome":"yes","to":"wait","actions":[]},
    {"id":"e5","from":"long","outcome":"no","to":"done","actions":[]},
    {"id":"e6","from":"wait","outcome":"next","to":"done","actions":[{"type":"generate_pdf"}]}
  ]
}$json$, 'ROLE_ADMIN', (select id::text from roles where org_id = '0000000a-0000-0000-0000-000000000001' and name = 'Admin')),
  'TPL_APPROVED', (select id::text from message_templates where org_id = '0000000a-0000-0000-0000-000000000001' and kind = 'record_approved'))::jsonb
where id = '0000000a-0000-0000-0000-00000000c001';

-- pg_cron → resume (local values only; hosted projects set their own, see README).
select vault.create_secret('http://host.docker.internal:54321/functions/v1/resume', 'resume_url');
select vault.create_secret('local-cron-secret', 'cron_secret');

-- Phase 4: pg_cron → send-messages (local values only; hosted projects set their own, see README).
select vault.create_secret('http://host.docker.internal:54321/functions/v1/send-messages', 'send_messages_url');
-- Phase 5: pg_cron / request_record_pdf → render-pdfs (local value only; hosted projects set their own, see README).
select vault.create_secret('http://host.docker.internal:54321/functions/v1/render-pdfs', 'render_pdfs_url');

-- The seeded Leave approval gets a report template, a saved report and a two-widget dashboard.
insert into report_templates (org_id, workflow_id, header, fields, signoff, updated_by) values
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000c001',
   E'Leave record\nAlpha School, Human Resources',
   '[{"nodeId":"start","key":"name"},{"nodeId":"start","key":"leave_type"},{"nodeId":"start","key":"reason"},
     {"nodeId":"start","key":"start"},{"nodeId":"start","key":"end"},{"nodeId":"start","key":"days"},
     {"nodeId":"start","key":"claims"},{"nodeId":"start","key":"total"},{"nodeId":"approve","key":"comment"}]',
   '["start","approve"]', '00000000-0000-0000-0000-0000000000a1');
insert into saved_reports (id, org_id, workflow_id, name, columns, filters, group_by, aggregate, created_by, updated_by) values
  ('0000000a-0000-0000-0000-00000000e001', '0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000c001',
   'Leave days by type', '[{"meta":"title"},{"field":"leave_type"},{"field":"days"},{"meta":"status"}]', '[]',
   '{"field":"leave_type"}', '{"fn":"sum","field":"days"}', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1');
insert into dashboard_widgets (org_id, report_id, kind, title, span, position) values
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000e001', 'number', 'Leave days taken', 1, 1),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000e001', 'bar', 'Leave days by type', 2, 2);
