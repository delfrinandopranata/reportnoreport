-- Contract Manager: a firm's contracts with its clients, reviewed by owner/admin, reminded before expiry.

create table contracts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade default auth_firm_id(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  start_date date not null,
  end_date date not null check (end_date > start_date),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  notes text not null default '',
  reminder_sent_at timestamptz,
  created_by uuid not null references profiles(id) default auth_profile_id(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contracts_firm_idx on contracts (firm_id);
create index contracts_client_idx on contracts (client_id);
-- Reminder job scans unreminded, approved, soon-to-expire contracts.
create index contracts_reminder_idx on contracts (status, end_date) where reminder_sent_at is null;

alter table contracts enable row level security;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger contracts_updated_at before update on contracts for each row execute function touch_updated_at();
create trigger log after insert or update or delete on contracts for each row execute function log_change();

-- Read/insert follow the clients.edit permission; there is no edit/delete — review happens via approve_contract().
create policy contracts_read on contracts for select using (firm_id = auth_firm_id());
create policy contracts_insert on contracts for insert
  with check (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id));

create or replace function approve_contract(p_contract uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_firm uuid := auth_firm_id();
begin
  if not auth_can('clients.edit') or auth_role() not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can review contracts.' using errcode = 'P0001';
  end if;
  if not firm_can_write(v_firm) then
    raise exception 'Your firm can''t make changes right now: %', firm_write_block_reason(v_firm) using errcode = 'P0001';
  end if;
  update contracts
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth_profile_id(), reviewed_at = now()
  where id = p_contract and firm_id = v_firm;
  if not found then raise exception 'Contract not found.' using errcode = 'P0001'; end if;
end $$;

revoke execute on function approve_contract(uuid, boolean) from public, anon;
grant execute on function approve_contract(uuid, boolean) to authenticated;
