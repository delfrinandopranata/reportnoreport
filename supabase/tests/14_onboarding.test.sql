begin;

select plan(30);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Test uses existing seed data (Alpha: owner a1, viewer a3; Beta: owner b1)
-- Reference IDs from seed.sql:
--   Alpha firm: 0000000a-0000-0000-0000-000000000001
--   Beta firm:  0000000b-0000-0000-0000-000000000001
--   owner@alpha.test: 00000000-0000-0000-0000-0000000000a1
--   viewer@alpha.test: 00000000-0000-0000-0000-0000000000a3
--   owner@beta.test: 00000000-0000-0000-0000-0000000000b1

-- Test 1: Owner can load sample data (Firm Alpha)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select load_sample_data()$$,
  'Owner can load sample data'
);

-- Verify the data was inserted
select is(
  (select count(*) from bank_accounts where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  1::bigint,
  'load_sample_data inserted 1 sample bank account'
);

select is(
  (select count(*) from clients where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  8::bigint,
  'load_sample_data inserted 8 sample clients'
);

select is(
  (select count(*) from transactions where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  150::bigint,
  'load_sample_data inserted ~150 sample transactions'
);

-- Verify the bank account is not the default
select is(
  (select is_default from bank_accounts where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  false,
  'Sample bank account is not the default'
);

-- Verify the sample bank account is active
select is(
  (select is_active from bank_accounts where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  true,
  'Sample bank account is active'
);

-- Test 2: Second load is idempotent (same counts)
select lives_ok(
  $$select load_sample_data()$$,
  'Second load_sample_data succeeds'
);

select is(
  (select count(*) from bank_accounts where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  1::bigint,
  'Second load is idempotent (bank accounts)'
);

select is(
  (select count(*) from clients where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  8::bigint,
  'Second load is idempotent (clients)'
);

select is(
  (select count(*) from transactions where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  150::bigint,
  'Second load is idempotent (transactions)'
);

-- Test 3: Viewer cannot call load_sample_data (should raise RLS error)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$select load_sample_data()$$,
  '42501',
  'Viewer cannot load sample data (RLS error)'
);

-- Test 4: Firm Beta can load its own sample data independently
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select lives_ok(
  $$select load_sample_data()$$,
  'Owner of Firm Beta can load sample data'
);

select is(
  (select count(*) from bank_accounts where firm_id = '0000000b-0000-0000-0000-000000000001' and is_sample),
  1::bigint,
  'Firm Beta has its own sample bank account'
);

select is(
  (select count(*) from clients where firm_id = '0000000b-0000-0000-0000-000000000001' and is_sample),
  8::bigint,
  'Firm Beta has its own 8 sample clients'
);

-- Verify Firm Alpha's sample data is untouched
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*) from clients where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  8::bigint,
  'Firm Alpha sample clients untouched after Firm Beta loaded'
);

-- Test 5: remove_sample_data deletes all sample rows, keeps real rows
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

-- First, add a real (non-sample) client to Firm Alpha
insert into clients (firm_id, name, is_sample) values ('0000000a-0000-0000-0000-000000000001', 'Real Client', false);

-- Now remove sample data
select lives_ok(
  $$select remove_sample_data()$$,
  'Owner can remove sample data'
);

-- Verify sample rows are gone
select is(
  (select count(*) from bank_accounts where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  0::bigint,
  'remove_sample_data deleted all sample bank accounts'
);

select is(
  (select count(*) from clients where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  0::bigint,
  'remove_sample_data deleted all sample clients'
);

select is(
  (select count(*) from transactions where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample),
  0::bigint,
  'remove_sample_data deleted all sample transactions'
);

-- Verify real rows remain
select is(
  (select count(*) from clients where firm_id = '0000000a-0000-0000-0000-000000000001' and name = 'Real Client'),
  1::bigint,
  'Real client remains after remove_sample_data'
);

-- Verify Firm Beta sample data still exists
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select count(*) from clients where firm_id = '0000000b-0000-0000-0000-000000000001' and is_sample),
  8::bigint,
  'Firm Beta sample clients untouched after Firm Alpha removed'
);

-- Test 6: Non-sample transaction referencing sample client blocks removal
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

-- First delete the real client we added, then reload sample data
delete from clients where firm_id = '0000000a-0000-0000-0000-000000000001' and name = 'Real Client';
select load_sample_data();

-- Create a non-sample transaction referencing a sample client
insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date, description, is_sample)
select '0000000a-0000-0000-0000-000000000001', id, (select id from bank_accounts where firm_id = '0000000a-0000-0000-0000-000000000001' limit 1),
       'receipt'::txn_kind, 100000, '2026-10-04', 'Non-sample txn with sample client', false
from clients where firm_id = '0000000a-0000-0000-0000-000000000001' and is_sample limit 1;

-- Now try to remove; should fail
select throws_ok(
  $$select remove_sample_data()$$,
  '42501',
  'Cannot remove sample data if non-sample transactions reference sample clients'
);

select * from finish();
rollback;
