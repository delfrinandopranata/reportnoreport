begin;
select plan(6);

-- Helpers
create or replace function pg_temp.new_firm(p_name text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into firms (id, name, currency, status, source, billing_status, trial_ends_at)
  values (v, p_name, 'MYR', 'active', 'admin', 'trial', now() + interval '14 days');
  return v;
end $$;

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Test 1: service_role can call record_payment
select ok(has_function_privilege('service_role', 'public.record_payment(uuid,text)', 'execute'), 'service_role can call record_payment');

-- Test 2: service_role can call record_refund
select ok(has_function_privilege('service_role', 'public.record_refund(uuid)', 'execute'), 'service_role can call record_refund');

-- Test 3: authenticated owner cannot execute record_payment (42501)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'::uuid);
select throws_like($$ select record_payment(auth_firm_id(), 'pi_test') $$, '%permission denied%', 'authenticated owner cannot call record_payment');

-- Test 4: authenticated owner cannot execute record_refund (42501)
select throws_like($$ select record_refund(auth_firm_id()) $$, '%permission denied%', 'authenticated owner cannot call record_refund');

-- Set up test data for tests 5 and 6
reset role;
insert into firms (id, name, currency, status, source, billing_status, trial_ends_at)
values
  ('00000000-0000-0000-0000-000000000055'::uuid, 'Payment Test Co', 'MYR', 'active', 'admin', 'trial', now() + interval '14 days'),
  ('00000000-0000-0000-0000-000000000056'::uuid, 'Refund Test Co', 'MYR', 'active', 'admin', 'trial', now() + interval '14 days');

-- Call record_payment
select record_payment('00000000-0000-0000-0000-000000000055'::uuid, 'pi_test123');
select record_payment('00000000-0000-0000-0000-000000000056'::uuid, 'pi_test456');

-- Test 5: service_role can record_payment and writes change_log
select ok(
  (select count(*) from change_log
   where firm_id = '00000000-0000-0000-0000-000000000055'::uuid
   and action = 'billing'
   and (before->>'billing_status') = 'trial'
   and (after->>'billing_status') = 'paid') = 1,
  'record_payment writes one change_log entry with before trial, after paid'
);

-- Call record_refund for test 6
select record_refund('00000000-0000-0000-0000-000000000056'::uuid);

-- Test 6: firm_write_block_reason returns "read_only" message after record_refund
select ok(
  firm_write_block_reason('00000000-0000-0000-0000-000000000056'::uuid) = 'This firm is read-only.',
  'firm_write_block_reason returns read-only message after refund'
);

select * from finish();
rollback;
