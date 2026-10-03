begin;
select plan(13);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- security definer (owned by postgres, which bypasses RLS) so a cross-firm id can be looked
-- up regardless of which firm is currently acting — otherwise the subquery is filtered to
-- nothing by clients_read/txns_read and the test would be inserting a NULL, not a real id.
create function pg_temp.beta_client_id() returns uuid language sql security definer as $$
  select id from clients where name = 'Marina Bay Studio Pte Ltd'
$$;
create function pg_temp.beta_txn_id() returns uuid language sql security definer as $$
  select id from transactions where description = 'Deposit'
$$;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'); -- owner@alpha
select lives_ok($$ insert into attachments (client_id, storage_path, original_name, mime_type, size_bytes)
  values ((select id from clients where name = 'Kopi Corner Sdn Bhd'), '0000000a-0000-0000-0000-000000000001/x.png', 'x.png', 'image/png', 1000) $$,
  'owner can attach a file to a client');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2'); -- accountant@alpha
select lives_ok($$ insert into attachments (transaction_id, storage_path, original_name, mime_type, size_bytes)
  values ((select id from transactions where description = 'Retainer received'), '0000000a-0000-0000-0000-000000000001/y.pdf', 'y.pdf', 'application/pdf', 2000) $$,
  'accountant can attach a file to a transaction');

select throws_ok($$ insert into attachments (client_id, transaction_id, storage_path, original_name, mime_type, size_bytes)
  values ((select id from clients where name = 'Kopi Corner Sdn Bhd'), (select id from transactions where description = 'Retainer received'), '0000000a-0000-0000-0000-000000000001/both.png', 'both.png', 'image/png', 1000) $$,
  '23514', null, 'exactly one of transaction_id/client_id must be set (both)');

select throws_ok($$ insert into attachments (storage_path, original_name, mime_type, size_bytes)
  values ('0000000a-0000-0000-0000-000000000001/neither.png', 'neither.png', 'image/png', 1000) $$,
  '23514', null, 'exactly one of transaction_id/client_id must be set (neither)');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3'); -- viewer@alpha
select throws_ok($$ insert into attachments (client_id, storage_path, original_name, mime_type, size_bytes)
  values ((select id from clients where name = 'Kopi Corner Sdn Bhd'), '0000000a-0000-0000-0000-000000000001/z.png', 'z.png', 'image/png', 1000) $$,
  '42501', null, 'viewer cannot attach a file');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4'); -- admin@alpha
select lives_ok($$ insert into attachments (client_id, storage_path, original_name, mime_type, size_bytes)
  values ((select id from clients where name = 'Kopi Corner Sdn Bhd'), '0000000a-0000-0000-0000-000000000001/w.png', 'w.png', 'image/png', 1000) $$,
  'admin can attach a file to a client');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'); -- owner@alpha
select throws_ok($$ insert into attachments (client_id, storage_path, original_name, mime_type, size_bytes)
  values (pg_temp.beta_client_id(), '0000000a-0000-0000-0000-000000000001/cross.png', 'cross.png', 'image/png', 1000) $$,
  'P0001', 'Client must belong to the same firm as the attachment.', 'cannot attach a file to another firm''s client');
select throws_ok($$ insert into attachments (transaction_id, storage_path, original_name, mime_type, size_bytes)
  values (pg_temp.beta_txn_id(), '0000000a-0000-0000-0000-000000000001/cross2.png', 'cross2.png', 'image/png', 1000) $$,
  'P0001', 'Transaction must belong to the same firm as the attachment.', 'cannot attach a file to another firm''s transaction');

select is((select count(*)::int from attachments), 3, 'alpha has 3 attachments so far');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3'); -- viewer@alpha
select is((select count(*)::int from attachments), 3, 'viewer can read attachments');
select is_empty($$ delete from attachments where original_name = 'x.png' returning id $$, 'viewer cannot delete an attachment');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1'); -- owner@alpha
select lives_ok($$ delete from attachments where original_name = 'x.png' $$, 'owner can delete an attachment');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1'); -- owner@beta
select is((select count(*)::int from attachments), 0, 'beta sees no alpha attachments');

select * from finish();
rollback;
