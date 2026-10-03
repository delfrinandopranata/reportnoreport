begin;
select plan(9);
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a2', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  import_transactions('[
    {"line":2,"client_name":"kopi corner sdn bhd","bank_account":null,"kind":"receipt","amount_minor":1000000,"date":"2026-08-20","description":"Retainer received"},
    {"line":3,"client_name":"New Co Sdn Bhd","bank_account":"Client account","kind":"payment","amount_minor":500,"date":"2026-09-02","description":"Stamp duty"}
  ]'::jsonb, true),
  '{"clients": 1, "duplicates": 1, "transactions": 1}'::jsonb, 'dry run counts new clients, duplicates and rows');

select is((select count(*)::int from clients where name = 'New Co Sdn Bhd'), 0, 'dry run writes nothing');

select is(
  import_transactions('[
    {"line":2,"client_name":"New Co Sdn Bhd","bank_account":null,"kind":"payment","amount_minor":500,"date":"2026-09-02","description":"Stamp duty"}
  ]'::jsonb),
  '{"clients": 1, "duplicates": 0, "transactions": 1}'::jsonb, 'import creates the client and the row');

select throws_ok(
  $$ select import_transactions('[
    {"line":2,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":100,"date":"2026-09-03","description":"ok"},
    {"line":3,"client_name":"Kopi Corner Sdn Bhd","bank_account":"Nonexistent","kind":"receipt","amount_minor":100,"date":"2026-09-03","description":"bad"}
  ]'::jsonb) $$,
  'P0001', 'Row 3: bank account "Nonexistent" not found.', 'unknown bank account names the row');

select is((select count(*)::int from transactions where description = 'ok'), 0, 'a failing import writes nothing');

select throws_ok(
  $$ select import_transactions('[
    {"line":2,"client_name":"Kopi Corner Sdn Bhd","bank_account":"Nope A","kind":"receipt","amount_minor":100,"date":"2026-09-03","description":"a"},
    {"line":3,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":100,"date":"2026-09-03","description":"fine"},
    {"line":4,"client_name":"Kopi Corner Sdn Bhd","bank_account":"Nope B","kind":"receipt","amount_minor":100,"date":"2026-09-03","description":"b"}
  ]'::jsonb) $$,
  'P0001', E'Row 2: bank account "Nope A" not found.\nRow 4: bank account "Nope B" not found.', 'every failing row is listed');

select is(
  import_transactions('[
    {"line":2,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":777,"date":"2026-09-04","description":"Twin cheque"},
    {"line":3,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":777,"date":"2026-09-04","description":"Twin cheque"}
  ]'::jsonb, true),
  '{"clients": 0, "duplicates": 0, "transactions": 2}'::jsonb, 'dry run keeps identical in-file rows');
select is(
  import_transactions('[
    {"line":2,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":777,"date":"2026-09-04","description":"Twin cheque"},
    {"line":3,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":777,"date":"2026-09-04","description":"Twin cheque"}
  ]'::jsonb),
  '{"clients": 0, "duplicates": 0, "transactions": 2}'::jsonb, 'real run agrees and imports both');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a3', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ select import_transactions('[{"line":2,"client_name":"Kopi Corner Sdn Bhd","bank_account":null,"kind":"receipt","amount_minor":1,"date":"2026-09-03","description":"x"}]'::jsonb) $$,
  'P0001', 'Your role can''t import transactions.', 'viewer cannot import');

select * from finish();
rollback;
