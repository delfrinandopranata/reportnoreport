-- Helpers are SECURITY DEFINER so policies can read profiles/firms without recursing into their own RLS.
create or replace function auth_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where user_id = auth.uid()
$$;

-- Null when the person or their firm is suspended, or the person hasn't accepted their invite.
create or replace function auth_firm_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.firm_id from profiles p join firms f on f.id = p.firm_id
  where p.user_id = auth.uid() and p.status = 'active' and f.status = 'active'
$$;

create or replace function auth_role() returns member_role
language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid() and status = 'active'
$$;

create or replace function auth_can(action text) returns boolean
language sql stable as $$
  select case auth_role()
    when 'owner' then true
    when 'admin' then action not in ('billing.pay', 'ownership.transfer')
    when 'accountant' then action in ('clients.edit', 'transactions.post', 'transactions.delete')
    else false
  end
$$;

create or replace function firm_write_block_reason(firm uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    -- Never reveal another firm's state. session_user, not current_user: this function is SECURITY DEFINER.
    when firm is distinct from auth_firm_id() and coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then 'Firm not found.'
    when f.id is null then 'Firm not found.'
    when f.status = 'suspended' then 'This firm''s access is suspended.'
    when f.billing_status in ('paid', 'complimentary') then null
    when f.billing_status = 'trial' and now() < f.trial_ends_at then null
    when f.billing_status = 'trial' then 'The free trial ended on ' || to_char(f.trial_ends_at, 'FMDD Mon YYYY') || '.'
    else 'This firm is read-only.'
  end
  from (select 1) one left join firms f on f.id = firm
$$;

create or replace function firm_can_write(firm uuid) returns boolean
language sql stable as $$ select firm_write_block_reason(firm) is null $$;

alter table bank_accounts alter column firm_id set default auth_firm_id();
alter table clients       alter column firm_id set default auth_firm_id();
alter table transactions  alter column firm_id set default auth_firm_id();

-- firms
create policy firms_read on firms for select using (id = auth_firm_id());
create policy firms_update on firms for update
  using (id = auth_firm_id() and auth_can('settings.manage') and firm_can_write(id))
  with check (id = auth_firm_id());

-- profiles: everyone in the firm can see the team; changes go through RPCs / the team function.
create policy profiles_read on profiles for select using (firm_id = auth_firm_id() or user_id = auth.uid());

-- bank accounts
create policy bank_read   on bank_accounts for select using (firm_id = auth_firm_id());
create policy bank_insert on bank_accounts for insert with check (firm_id = auth_firm_id() and auth_can('settings.manage') and firm_can_write(firm_id));
create policy bank_update on bank_accounts for update using (firm_id = auth_firm_id() and auth_can('settings.manage') and firm_can_write(firm_id)) with check (firm_id = auth_firm_id());

-- clients
create policy clients_read   on clients for select using (firm_id = auth_firm_id());
create policy clients_insert on clients for insert with check (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id));
create policy clients_update on clients for update using (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id)) with check (firm_id = auth_firm_id());
create policy clients_delete on clients for delete using (firm_id = auth_firm_id() and auth_can('clients.delete') and firm_can_write(firm_id));

-- transactions
create policy txns_read   on transactions for select using (firm_id = auth_firm_id());
create policy txns_insert on transactions for insert with check (firm_id = auth_firm_id() and auth_can('transactions.post') and firm_can_write(firm_id));
create policy txns_update on transactions for update using (firm_id = auth_firm_id() and auth_can('transactions.post') and firm_can_write(firm_id)) with check (firm_id = auth_firm_id());
create policy txns_delete on transactions for delete using (firm_id = auth_firm_id() and auth_can('transactions.delete') and firm_can_write(firm_id));

-- change log: owners and admins read; only triggers write.
create policy log_read on change_log for select using (firm_id = auth_firm_id() and auth_role() in ('owner', 'admin'));

-- preferences: private per person.
create policy prefs_all on user_preferences for all using (profile_id = auth_profile_id()) with check (profile_id = auth_profile_id());

-- platform_settings, waitlist, stripe_events: no policies → service role only (Plans B/C add what they need).
