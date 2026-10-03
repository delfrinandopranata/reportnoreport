-- Local development only. Password for every user: password123
create or replace function pg_temp.add_user(p_id uuid, p_email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, json_build_object('sub', p_id::text, 'email', p_email), 'email', now(), now(), now());
$$;

select pg_temp.add_user('00000000-0000-0000-0000-0000000000a1', 'owner@alpha.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000a2', 'accountant@alpha.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000a3', 'viewer@alpha.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000a4', 'admin@alpha.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000b1', 'owner@beta.test');
select pg_temp.add_user('00000000-0000-0000-0000-0000000000f1', 'admin@platform.test');

insert into firms (id, name, currency, billing_status, source, address1, city, state, postcode, registration_no)
values ('0000000a-0000-0000-0000-000000000001', 'Alpha Advisory Sdn Bhd', 'MYR', 'complimentary', 'admin',
        'Level 18, Menara Binjai', 'Kuala Lumpur', 'Kuala Lumpur', '50450', '202301012345 (1501234-A)');
insert into firms (id, name, currency, billing_status, trial_ends_at, source, country)
values ('0000000b-0000-0000-0000-000000000001', 'Beta Partners Pte Ltd', 'SGD', 'trial', now() + interval '14 days', 'self_serve', 'Singapore');

insert into profiles (user_id, firm_id, name, email, role, status, is_super_admin) values
  ('00000000-0000-0000-0000-0000000000a1', '0000000a-0000-0000-0000-000000000001', 'Lim Boon Hock', 'owner@alpha.test', 'owner', 'active', false),
  ('00000000-0000-0000-0000-0000000000a2', '0000000a-0000-0000-0000-000000000001', 'Rajesh Kumar', 'accountant@alpha.test', 'accountant', 'active', false),
  ('00000000-0000-0000-0000-0000000000a3', '0000000a-0000-0000-0000-000000000001', 'Chong Mei Ling', 'viewer@alpha.test', 'viewer', 'active', false),
  ('00000000-0000-0000-0000-0000000000a4', '0000000a-0000-0000-0000-000000000001', 'Nur Aisyah', 'admin@alpha.test', 'admin', 'active', false),
  ('00000000-0000-0000-0000-0000000000b1', '0000000b-0000-0000-0000-000000000001', 'Tan Wei Ming', 'owner@beta.test', 'owner', 'active', false),
  ('00000000-0000-0000-0000-0000000000f1', null, 'Platform Admin', 'admin@platform.test', 'viewer', 'active', true);

insert into bank_accounts (id, firm_id, name, bank_name, account_name, account_no, is_default) values
  ('0000000a-0000-0000-0000-0000000000ba', '0000000a-0000-0000-0000-000000000001', 'Client account', 'Maybank', 'Alpha Advisory Sdn Bhd – Client Account', '5140 1234 5678', true),
  ('0000000b-0000-0000-0000-0000000000ba', '0000000b-0000-0000-0000-000000000001', 'Client account', 'DBS', 'Beta Partners – Client Account', '072-123456-7', true);

insert into clients (id, firm_id, name, contact, email, phone, city, state, postcode, tags) values
  ('0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-000000000001', 'Kopi Corner Sdn Bhd', 'Wei Jie Ong', 'weijie@kopicorner.example', '+60123456789', 'Petaling Jaya', 'Selangor', '46200', '{Retainer}'),
  ('0000000a-0000-0000-0000-0000000000c2', '0000000a-0000-0000-0000-000000000001', 'Harbourline Logistics Sdn Bhd', 'Aisha Rahman', 'aisha@harbourline.example', '+60123456781', 'Klang', 'Selangor', '41200', '{Priority}'),
  ('0000000b-0000-0000-0000-0000000000c1', '0000000b-0000-0000-0000-000000000001', 'Marina Bay Studio Pte Ltd', 'Grace Lee', 'grace@marinabay.example', '+6591234567', 'Singapore', '', '018956', '{}');

insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date, description) values
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt', 1000000, '2026-08-20', 'Retainer received'),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'payment',  250000, '2026-08-31', 'Filing fees'),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'payment',  100000, '2026-09-05', 'Supplier payment'),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c1', '0000000a-0000-0000-0000-0000000000ba', 'receipt',   40000, '2026-09-30', 'Top-up'),
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000c2', '0000000a-0000-0000-0000-0000000000ba', 'receipt',  500000, '2026-09-10', 'Escrow deposit'),
  ('0000000b-0000-0000-0000-000000000001', '0000000b-0000-0000-0000-0000000000c1', '0000000b-0000-0000-0000-0000000000ba', 'receipt',  300000, '2026-09-12', 'Deposit');
