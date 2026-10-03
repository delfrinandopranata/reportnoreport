begin;
select plan(14);

-- helpers
create or replace function pg_temp.new_user(p_email text, p_confirmed boolean) returns uuid language plpgsql security definer as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', p_email, '', case when p_confirmed then now() end, '{}', '{}', now(), now(), '', '', '', '');
  return v;
end $$;
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select ok(has_function_privilege('anon', 'public.platform_status()', 'execute'), 'anon can read platform status');
select ok(has_function_privilege('anon', 'public.join_waitlist(text,text)', 'execute'), 'anon can join the waitlist');
select ok(not has_function_privilege('anon', 'public.create_firm_for_current_user(text,text,text)', 'execute'), 'anon cannot create firms');

-- cap: seed has 1 self_serve firm (Beta). Set cap to 2 → one slot left.
update platform_settings set firm_cap = 2;
select is((platform_status()->>'accepting_signups')::boolean, true, 'accepting while below cap');

select pg_temp.act_as(pg_temp.new_user('unverified@new.test', false));
select throws_ok($$ select create_firm_for_current_user('Unverified Co', 'MYR', 'Una') $$, 'P0001', 'Verify your email address before creating your firm.', 'unverified email refused');

select pg_temp.act_as(pg_temp.new_user('first@new.test', true));
select isnt(create_firm_for_current_user('First Co Sdn Bhd', 'MYR', 'First Person'), null, 'verified user creates a firm');
select is((select row(role::text, status::text)::text from profiles where email = 'first@new.test'), '(owner,active)', 'creator is the active owner');
select is((select count(*)::int from bank_accounts b join firms f on f.id = b.firm_id where f.name = 'First Co Sdn Bhd' and b.is_default), 1, 'firm starts with a default bank account');
select throws_ok($$ select create_firm_for_current_user('Second', 'MYR', 'First Person') $$, 'P0001', 'You already belong to a firm.', 'no second firm');

select pg_temp.act_as(pg_temp.new_user('late@new.test', true));
select throws_ok($$ select create_firm_for_current_user('Late Co', 'MYR', 'Late') $$, 'P0001', 'EARLY_ACCESS_FULL', 'cap reached');
reset role;
select is((platform_status()->>'accepting_signups')::boolean, false, 'not accepting at cap');

reset role;
select ok((select trial_ends_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour' from firms where name = 'First Co Sdn Bhd'), 'trial ends after trial_days');

-- join_waitlist tests
select throws_ok($$ select join_waitlist('bad', 'X') $$, 'P0001', 'Enter a valid email address.', 'invalid email rejected');
select pg_temp.act_as(pg_temp.new_user('waitlist@test.test', true));
select join_waitlist('WaitList@Test.Test', 'Test Firm');
select join_waitlist('waitlist@test.test', 'Another Firm');
reset role;
select is((select count(*)::int from waitlist where lower(email) = 'waitlist@test.test'), 1, 'calling twice with same email leaves one row');

select * from finish();
rollback;
