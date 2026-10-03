-- All-or-nothing: any error rolls back the whole call. SECURITY INVOKER so RLS and firm_can_write apply.
create or replace function import_transactions(p_rows jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_firm uuid := auth_firm_id();
  v_default_bank uuid;
  r jsonb;
  v_client uuid;
  v_bank uuid;
  v_new_clients int := 0;
  v_dupes int := 0;
  v_rows int := 0;
  v_seen_new text[] := '{}';
begin
  if v_firm is null then raise exception 'You are not signed in to an active firm.' using errcode = 'P0001'; end if;
  if not auth_can('transactions.post') then raise exception 'Your role can''t import transactions.' using errcode = 'P0001'; end if;
  if not firm_can_write(v_firm) then raise exception 'Your firm can''t make changes right now: %', firm_write_block_reason(v_firm) using errcode = 'P0001'; end if;

  select id into v_default_bank from bank_accounts where firm_id = v_firm and is_default and is_active;

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'bank_account', '') = '' then
      v_bank := v_default_bank;
      if v_bank is null then raise exception 'Row %: no default bank account is set.', r->>'line' using errcode = 'P0001'; end if;
    else
      select id into v_bank from bank_accounts where firm_id = v_firm and is_active and lower(name) = lower(trim(r->>'bank_account'));
      if v_bank is null then raise exception 'Row %: bank account "%" not found.', r->>'line', r->>'bank_account' using errcode = 'P0001'; end if;
    end if;

    select id into v_client from clients where firm_id = v_firm and lower(name) = lower(trim(r->>'client_name')) limit 1;
    if v_client is null then
      if not (lower(trim(r->>'client_name')) = any (v_seen_new)) then
        v_new_clients := v_new_clients + 1;
        v_seen_new := v_seen_new || lower(trim(r->>'client_name'));
      end if;
      if not p_dry_run then
        insert into clients (name) values (trim(r->>'client_name')) returning id into v_client;
      end if;
    elsif exists (select 1 from transactions where client_id = v_client and date = (r->>'date')::date
                  and kind = (r->>'kind')::txn_kind and amount_minor = (r->>'amount_minor')::bigint
                  and description = coalesce(r->>'description', '')) then
      v_dupes := v_dupes + 1;
      continue;
    end if;

    v_rows := v_rows + 1;
    if not p_dry_run then
      insert into transactions (client_id, bank_account_id, kind, amount_minor, date, description)
      values (v_client, v_bank, (r->>'kind')::txn_kind, (r->>'amount_minor')::bigint, (r->>'date')::date, coalesce(r->>'description', ''));
    end if;
  end loop;

  return jsonb_build_object('transactions', v_rows, 'clients', v_new_clients, 'duplicates', v_dupes);
end $$;
