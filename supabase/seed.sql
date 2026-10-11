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
-- select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
-- select create_org('Alpha School', '0000000a-0000-0000-0000-000000000001');
-- select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
-- select create_org('Beta HR', '0000000b-0000-0000-0000-000000000001');

-- Alpha members with one system role each.
-- insert into members (org_id, user_id, email, status)
-- values ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin@alpha.test', 'active'),
--        ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'member@alpha.test', 'active'),
--        ('0000000a-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'viewer@alpha.test', 'active');
-- insert into member_roles (member_id, role_id)
-- select m.id, r.id from members m join roles r on r.org_id = m.org_id
-- where m.org_id = '0000000a-0000-0000-0000-000000000001'
--   and (m.email, r.name) in (('admin@alpha.test','Admin'), ('member@alpha.test','Member'), ('viewer@alpha.test','Viewer'));
