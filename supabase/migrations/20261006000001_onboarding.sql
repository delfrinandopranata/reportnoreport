-- Sample data loading and removal for onboarding

create or replace function load_sample_data() returns void
language plpgsql security invoker as $$
declare
  v_firm_id uuid;
  v_bank_id uuid;
  v_client_ids uuid[];
  v_idx int;
begin
  -- Check authorization
  if not auth_can('settings.manage') then
    raise exception 'permission denied for settings.manage';
  end if;

  v_firm_id := auth_firm_id();

  if not firm_can_write(v_firm_id) then
    raise exception 'permission denied: firm cannot write';
  end if;

  -- Idempotence check: if sample data already exists, return early
  if exists (select 1 from clients where firm_id = v_firm_id and is_sample) then
    return;
  end if;

  -- Create one sample bank account (not the default)
  with inserted_bank as (
    insert into bank_accounts (firm_id, name, bank_name, account_name, account_no, is_active, is_sample)
    select v_firm_id, 'Sample account', 'Sample Bank', 'Sample account', '0000-0000-0000', true, true
    where not exists (select 1 from bank_accounts where firm_id = v_firm_id and is_sample)
    returning id
  )
  select id into v_bank_id from inserted_bank;

  -- If the bank account already existed (shouldn't happen due to idempotence), fetch it
  if v_bank_id is null then
    select id into v_bank_id from bank_accounts where firm_id = v_firm_id and is_sample limit 1;
  end if;

  -- Create 8 sample clients (reusing Malaysian names from seed)
  insert into clients (firm_id, name, contact, email, phone, city, state, postcode, tags, is_sample)
  values
    (v_firm_id, 'Kopi Corner Sdn Bhd', 'Wei Jie Ong', 'weijie@kopicorner.example', '+60123456789', 'Petaling Jaya', 'Selangor', '46200', '{Retainer}', true),
    (v_firm_id, 'Harbourline Logistics Sdn Bhd', 'Aisha Rahman', 'aisha@harbourline.example', '+60123456781', 'Klang', 'Selangor', '41200', '{Priority}', true),
    (v_firm_id, 'LIM Boon Hock & Associates', 'Lim Boon Hock', 'contact@limboonhock.example', '+60198765432', 'Kuala Lumpur', 'Kuala Lumpur', '50200', '{Legal}', true),
    (v_firm_id, 'Equity Legal Sdn Bhd', 'Nur Aisyah', 'info@equitylegal.example', '+60187654321', 'Subang Jaya', 'Selangor', '40700', '{Corporate}', true),
    (v_firm_id, 'Rajesh Trading Co Sdn Bhd', 'Rajesh Kumar', 'rajesh@rajeshtrading.example', '+60176543210', 'Ipoh', 'Perak', '30000', '{Retainer}', true),
    (v_firm_id, 'Chong Mei Ling Consultancy', 'Chong Mei Ling', 'mei@chongconsult.example', '+60165432109', 'Johor Bahru', 'Johor', '80000', '{Advisory}', true),
    (v_firm_id, 'Tan Wei Ming Property Ventures', 'Tan Wei Ming', 'contact@twmproperty.example', '+60154321098', 'Penang', 'Penang', '10200', '{Property}', true),
    (v_firm_id, 'Marina Development Group', 'Grace Lee', 'grace@marinadev.example', '+6018901234', 'Cyberjaya', 'Selangor', '62988', '{Development}', true);

  select array_agg(id) into v_client_ids from clients where firm_id = v_firm_id and is_sample;

  -- Create ~150 sample transactions across 6 months (Apr-Sep 2026)
  insert into transactions (firm_id, client_id, bank_account_id, kind, amount_minor, date, description, is_sample)
  with client_txns as (
    select unnest(v_client_ids) as client_id, generate_subscripts(v_client_ids, 1) as client_num
  )
  select
    v_firm_id,
    client_id,
    v_bank_id,
    case when (seq % 3 = 0) then 'payment'::txn_kind else 'receipt'::txn_kind end,
    case when (seq % 3 = 0) then (25000 + (client_num::int * 3000)) else (100000 + (client_num::int * 5000)) end,
    '2026-04-01'::date + (seq || ' days')::interval,
    case when (seq % 3 = 0) then
      case client_num when 1 then 'Filing fees' when 2 then 'Court fees' when 3 then 'Stamp duty' when 4 then 'Corporate fees paid' when 5 then 'Supplier payment' when 6 then 'Expense reimbursement' when 7 then 'Property costs' when 8 then 'Project expense' else 'Payment' end
    else
      case client_num when 1 then 'Retainer received' when 2 then 'Escrow deposit' when 3 then 'Legal fees' when 4 then 'Corporate fees received' when 5 then 'Service fee' when 6 then 'Consultation fee' when 7 then 'Property deposit' when 8 then 'Project retainer' else 'Payment received' end
    end,
    true
  from client_txns,
  lateral generate_series(0, 18) as t(seq);

end $$;

create or replace function remove_sample_data() returns void
language plpgsql security invoker as $$
declare
  v_firm_id uuid;
begin
  -- Check authorization
  if not auth_can('settings.manage') then
    raise exception 'permission denied for settings.manage';
  end if;

  v_firm_id := auth_firm_id();

  if not firm_can_write(v_firm_id) then
    raise exception 'permission denied: firm cannot write';
  end if;

  -- Check if any non-sample transaction references a sample client
  if exists (
    select 1
    from transactions t
    where t.firm_id = v_firm_id
      and t.is_sample = false
      and t.client_id in (select id from clients where firm_id = v_firm_id and is_sample)
  ) then
    raise exception 'permission denied: cannot remove sample data with non-sample transactions referencing sample clients';
  end if;

  -- Delete in reverse dependency order
  delete from transactions
  where firm_id = v_firm_id and is_sample = true;

  delete from clients
  where firm_id = v_firm_id and is_sample = true;

  delete from bank_accounts
  where firm_id = v_firm_id and is_sample = true;
end $$;

-- Revoke execute from public and anon; only authenticated users can call (via RLS checks in the functions)
revoke execute on function load_sample_data() from public, anon;
revoke execute on function remove_sample_data() from public, anon;
