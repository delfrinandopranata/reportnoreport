create or replace function assert_manager(p_target uuid) returns profiles
language plpgsql security definer set search_path = public as $$
declare v_actor profiles; v_target profiles;
begin
  select * into v_actor from profiles where user_id = auth.uid() and status = 'active';
  if v_actor.id is null or not auth_can('users.manage') then
    raise exception 'Your role can''t manage users.' using errcode = 'P0001';
  end if;
  select * into v_target from profiles where id = p_target;
  if v_target.id is null or v_target.firm_id is distinct from v_actor.firm_id then
    raise exception 'That person is not in your firm.' using errcode = 'P0001';
  end if;
  if v_target.id = v_actor.id then raise exception 'You can''t change your own access.' using errcode = 'P0001'; end if;
  if v_target.role = 'owner' then raise exception 'Only the owner can change the owner.' using errcode = 'P0001'; end if;
  if not firm_can_write(v_actor.firm_id) then
    raise exception 'Your firm can''t make changes right now: %', firm_write_block_reason(v_actor.firm_id) using errcode = 'P0001';
  end if;
  return v_target;
end $$;
revoke execute on function assert_manager(uuid) from public, anon, authenticated;

create or replace function accept_invite() returns void language sql security definer set search_path = public as $$
  update profiles set status = 'active', last_active_at = now() where user_id = auth.uid() and status = 'invited'
$$;

create or replace function touch_last_active() returns void language sql security definer set search_path = public as $$
  update profiles set last_active_at = now() where user_id = auth.uid() and status = 'active'
$$;

create or replace function change_member_role(p_profile uuid, p_role member_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_manager(p_profile);
  if p_role = 'owner' then raise exception 'Use Transfer ownership to make someone the owner.' using errcode = 'P0001'; end if;
  update profiles set role = p_role where id = p_profile;
end $$;

create or replace function suspend_member(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_manager(p_profile);
  update profiles set status = 'suspended' where id = p_profile;
end $$;

create or replace function reactivate_member(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_target profiles;
begin
  v_target := assert_manager(p_profile);
  -- Someone who never signed in goes back to invited, not active.
  update profiles set status = case when v_target.last_active_at is null then 'invited' else 'active' end::member_status
  where id = p_profile;
end $$;

create or replace function transfer_ownership(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor profiles; v_target profiles;
begin
  select * into v_actor from profiles where user_id = auth.uid() and status = 'active';
  if v_actor.role is distinct from 'owner' then raise exception 'Only the owner can transfer ownership.' using errcode = 'P0001'; end if;
  select * into v_target from profiles where id = p_profile and firm_id = v_actor.firm_id and status = 'active';
  if v_target.id is null then raise exception 'Choose an active member of your firm.' using errcode = 'P0001'; end if;
  if v_target.id = v_actor.id then raise exception 'You are already the owner.' using errcode = 'P0001'; end if;
  -- Demote first so the one-owner index never sees two owners.
  update profiles set role = 'admin' where id = v_actor.id;
  update profiles set role = 'owner' where id = v_target.id;
end $$;
