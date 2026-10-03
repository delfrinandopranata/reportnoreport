-- Temporary: product is free for now. Reversible — a future migration can set billing_status
-- back to 'trial' (and compute trial_ends_at) for any firm that still hasn't paid.

create or replace function create_firm_for_current_user(p_firm_name text, p_currency text, p_person_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user auth.users;
  v_settings platform_settings;
  v_firm uuid;
  v_profile uuid;
begin
  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null then raise exception 'Please sign in again.' using errcode = 'P0001'; end if;
  if v_user.email_confirmed_at is null then raise exception 'Verify your email address before creating your firm.' using errcode = 'P0001'; end if;
  if exists (select 1 from profiles where user_id = v_user.id) then raise exception 'You already belong to a firm.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_firm_name), '') = '' then raise exception 'Enter your firm name.' using errcode = 'P0001'; end if;
  if coalesce(trim(p_person_name), '') = '' then raise exception 'Enter your name.' using errcode = 'P0001'; end if;
  if p_currency not in ('MYR', 'SGD', 'USD') then raise exception 'Choose MYR, SGD or USD.' using errcode = 'P0001'; end if;

  -- Serialise sign-ups so two people can't take the last slot at once.
  select * into v_settings from platform_settings for update;
  if (select count(*) from firms where source = 'self_serve') >= v_settings.firm_cap then
    raise exception 'EARLY_ACCESS_FULL' using errcode = 'P0001';
  end if;

  insert into firms (name, currency, billing_status, trial_ends_at, source)
  values (trim(p_firm_name), p_currency, 'complimentary', null, 'self_serve')
  returning id into v_firm;
  insert into profiles (user_id, firm_id, name, email, role, status, last_active_at)
  values (v_user.id, v_firm, trim(p_person_name), lower(v_user.email), 'owner', 'active', now())
  returning id into v_profile;
  insert into bank_accounts (firm_id, name, is_default) values (v_firm, 'Client account', true);
  return v_firm;
end $$;

-- Move every firm not yet paid to free access too; never touch firms already paid.
update firms set billing_status = 'complimentary' where billing_status in ('trial', 'read_only');
