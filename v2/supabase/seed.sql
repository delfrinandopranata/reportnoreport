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
