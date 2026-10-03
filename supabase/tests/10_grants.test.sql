begin;
select plan(8);

select ok(not has_function_privilege('anon', 'public.accept_invite()', 'execute'), 'anon cannot accept_invite');
select ok(not has_function_privilege('anon', 'public.transfer_ownership(uuid)', 'execute'), 'anon cannot transfer_ownership');
select ok(not has_function_privilege('anon', 'public.import_transactions(jsonb, boolean)', 'execute'), 'anon cannot import_transactions');
select ok(not has_function_privilege('anon', 'public.auth_firm_id()', 'execute'), 'anon cannot call auth_firm_id');
select ok(has_function_privilege('authenticated', 'public.accept_invite()', 'execute'), 'authenticated can accept_invite');
select ok(has_function_privilege('authenticated', 'public.transfer_ownership(uuid)', 'execute'), 'authenticated can transfer_ownership');
select ok(has_function_privilege('authenticated', 'public.import_transactions(jsonb, boolean)', 'execute'), 'authenticated can import_transactions');
select ok(has_function_privilege('authenticated', 'public.auth_can(text)', 'execute'), 'authenticated can call auth_can (RLS)');

select * from finish();
rollback;
