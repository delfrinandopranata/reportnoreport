create unique index one_owner_per_firm on profiles (firm_id) where role = 'owner' and status <> 'suspended';
create unique index one_default_bank_per_firm on bank_accounts (firm_id) where is_default;

create or replace function check_same_firm() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'transactions' then
    if not exists (select 1 from clients where id = new.client_id and firm_id = new.firm_id)
       or not exists (select 1 from bank_accounts where id = new.bank_account_id and firm_id = new.firm_id) then
      raise exception 'Client and bank account must belong to the same firm as the transaction.' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'clients' and new.assigned_to is not null then
    if not exists (select 1 from profiles where id = new.assigned_to and firm_id = new.firm_id) then
      raise exception 'The assigned member must belong to the same firm.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger same_firm before insert or update on transactions for each row execute function check_same_firm();
create trigger same_firm before insert or update on clients for each row execute function check_same_firm();

-- Platform-owned columns may only change via the service role (Edge Functions / dashboard).
create or replace function lock_firm_columns() returns trigger language plpgsql as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from transactions where firm_id = old.id) then
    raise exception 'The firm currency can''t change once transactions exist.' using errcode = 'P0001';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' and (
       new.billing_status is distinct from old.billing_status or new.trial_ends_at is distinct from old.trial_ends_at
    or new.paid_at is distinct from old.paid_at or new.status is distinct from old.status or new.source is distinct from old.source
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id) then
    raise exception 'Billing details can only be changed by the platform.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger lock_columns before update on firms for each row execute function lock_firm_columns();

create or replace function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(coalesce(new, old));
  v_firm uuid := case when tg_table_name = 'firms' then (j->>'id')::uuid else (j->>'firm_id')::uuid end;
begin
  insert into change_log (firm_id, table_name, row_id, action, before, after, actor)
  values (v_firm, tg_table_name, (j->>'id')::uuid, lower(tg_op)::change_action,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;
create trigger log after insert or update or delete on firms         for each row execute function log_change();
create trigger log after insert or update or delete on profiles      for each row execute function log_change();
create trigger log after insert or update or delete on bank_accounts for each row execute function log_change();
create trigger log after insert or update or delete on clients       for each row execute function log_change();
create trigger log after insert or update or delete on transactions  for each row execute function log_change();
