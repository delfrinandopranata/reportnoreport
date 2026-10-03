begin;
select plan(3);

-- Authenticated user cannot execute support_client_balances
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ select support_client_balances('0000000a-0000-0000-0000-000000000001', '2026-09-01', '2026-09-30') $$,
  'permission denied for function support_client_balances',
  'authenticated user cannot execute support_client_balances'
);

-- Service role can execute
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000f1', 'role', 'service_role')::text, true);
set local role service_role;

-- For Alpha (0000000a-0000-0000-0000-000000000001), returns only Alpha clients with correct totals
select is(
  (select array_agg(row(client_id, opening, receipts, payments, closing, txn_count)::text order by client_id)
   from support_client_balances('0000000a-0000-0000-0000-000000000001', '2026-09-01', '2026-09-30')),
  array['(0000000a-0000-0000-0000-0000000000c1,750000,40000,100000,690000,2)',
        '(0000000a-0000-0000-0000-0000000000c2,0,500000,0,500000,1)']::text[],
  'Alpha firm returns only Alpha clients with correct totals'
);

-- For Beta (0000000b-0000-0000-0000-000000000001), returns only Beta clients
select is(
  (select array_agg(row(client_id, closing)::text order by client_id)
   from support_client_balances('0000000b-0000-0000-0000-000000000001', '2026-09-01', '2026-09-30')),
  array['(0000000b-0000-0000-0000-0000000000c1,300000)']::text[],
  'Beta firm returns only Beta clients'
);

select * from finish();
rollback;
