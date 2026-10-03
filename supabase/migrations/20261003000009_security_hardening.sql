-- 1. Function grants: nothing is callable by anon/public; clients get only what the app uses.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;
grant execute on function
  auth_profile_id(), auth_firm_id(), auth_role(), auth_can(text), firm_write_block_reason(uuid), firm_can_write(uuid),
  accept_invite(), touch_last_active(), change_member_role(uuid, member_role), suspend_member(uuid),
  reactivate_member(uuid), transfer_ownership(uuid), client_balances(date, date, uuid, uuid),
  ledger_lines(date, date, uuid, uuid, boolean), import_transactions(jsonb, boolean)
to authenticated;

-- 2. transfer_ownership honours the write gate, like every other team RPC.
create or replace function transfer_ownership(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor profiles; v_target profiles;
begin
  select * into v_actor from profiles where user_id = auth.uid() and status = 'active';
  if v_actor.role is distinct from 'owner' then raise exception 'Only the owner can transfer ownership.' using errcode = 'P0001'; end if;
  if not firm_can_write(v_actor.firm_id) then
    raise exception 'Your firm can''t make changes right now: %', firm_write_block_reason(v_actor.firm_id) using errcode = 'P0001';
  end if;
  select * into v_target from profiles where id = p_profile and firm_id = v_actor.firm_id and status = 'active';
  if v_target.id is null then raise exception 'Choose an active member of your firm.' using errcode = 'P0001'; end if;
  if v_target.id = v_actor.id then raise exception 'You are already the owner.' using errcode = 'P0001'; end if;
  update profiles set role = 'admin' where id = v_actor.id;
  update profiles set role = 'owner' where id = v_target.id;
end $$;

-- 3. Logo writes need firm_can_write; update cannot move an object out of the firm folder.
drop policy logos_write on storage.objects;
drop policy logos_update on storage.objects;
drop policy logos_delete on storage.objects;
create policy logos_write on storage.objects for insert
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage') and firm_can_write(auth_firm_id()));
create policy logos_update on storage.objects for update
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage') and firm_can_write(auth_firm_id()))
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage') and firm_can_write(auth_firm_id()));
create policy logos_delete on storage.objects for delete
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage') and firm_can_write(auth_firm_id()));

-- 4. Import: validate every row first and report all failures; duplicates only match rows that existed before this call.
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
  v_errors text[] := '{}';
begin
  if v_firm is null then raise exception 'You are not signed in to an active firm.' using errcode = 'P0001'; end if;
  if not auth_can('transactions.post') then raise exception 'Your role can''t import transactions.' using errcode = 'P0001'; end if;
  if not firm_can_write(v_firm) then raise exception 'Your firm can''t make changes right now: %', firm_write_block_reason(v_firm) using errcode = 'P0001'; end if;

  select id into v_default_bank from bank_accounts where firm_id = v_firm and is_default and is_active;

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'bank_account', '') = '' then
      if v_default_bank is null then v_errors := v_errors || format('Row %s: no default bank account is set.', r->>'line'); end if;
    elsif not exists (select 1 from bank_accounts where firm_id = v_firm and is_active and lower(name) = lower(trim(r->>'bank_account'))) then
      v_errors := v_errors || format('Row %s: bank account "%s" not found.', r->>'line', r->>'bank_account');
    end if;
  end loop;
  if cardinality(v_errors) > 0 then raise exception '%', array_to_string(v_errors, E'\n') using errcode = 'P0001'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'bank_account', '') = '' then
      v_bank := v_default_bank;
    else
      select id into v_bank from bank_accounts where firm_id = v_firm and is_active and lower(name) = lower(trim(r->>'bank_account'));
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
    -- created_at < now(): only rows from before this call count, so dry run and real run agree.
    elsif exists (select 1 from transactions where client_id = v_client and date = (r->>'date')::date
                  and kind = (r->>'kind')::txn_kind and amount_minor = (r->>'amount_minor')::bigint
                  and description = coalesce(r->>'description', '') and created_at < now()) then
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
