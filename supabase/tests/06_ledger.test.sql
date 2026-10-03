begin;
select plan(6);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Seed Kopi Corner: +1,000,000 (20 Aug) −250,000 (31 Aug) −100,000 (5 Sep) +40,000 (30 Sep)
select is(
  (select row(opening, receipts, payments, closing, txn_count)::text from client_balances('2026-09-01', '2026-09-30')
   where client_id = '0000000a-0000-0000-0000-0000000000c1'),
  '(750000,40000,100000,690000,2)', 'September balances for Kopi Corner');

select is(
  (select array_agg(balance order by date) from ledger_lines('2026-09-01', '2026-09-30', '0000000a-0000-0000-0000-0000000000c1')),
  array[650000, 690000]::bigint[], 'running balance starts from the opening balance');

select is(
  (select count(*)::int from client_balances('2026-09-01', '2026-09-30')), 2, 'one row per client in the firm, including zero-activity');

select is(
  (select closing from client_balances('2026-01-01', '2026-12-31', null, '0000000a-0000-0000-0000-0000000000c2')),
  500000::bigint, 'p_client limits to one client');

select is(
  (select array_agg(balance order by date, created_at) from ledger_lines('2026-09-01', '2026-09-30', null, null, true)),
  array[650000, 500000, 690000]::bigint[], 'per-client running balances when p_per_client');

select is(
  (select array_agg(balance order by date, created_at) from ledger_lines('2026-09-01', '2026-09-30')),
  array[650000, 1150000, 1190000]::bigint[], 'firm-wide running balance by default');

select * from finish();
rollback;
