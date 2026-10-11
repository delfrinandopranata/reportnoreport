-- QA-5: helpers are for use inside security definer functions only.
revoke execute on function require_permission(uuid, text), owner_count(uuid) from public, anon, authenticated;

-- QA-7: org rename is audited (the row-level orgs_update policy lets roles.manage holders rename).
create or replace function audit_org_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    perform audit(new.id, 'org.rename', new.id::text, jsonb_build_object('name', old.name), jsonb_build_object('name', new.name));
  end if;
  return new;
end $$;
create trigger orgs_audit_rename after update on orgs for each row execute function audit_org_rename();

-- QA-7: record which members lost the role.
create or replace function delete_role(p_role_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role roles;
  v_members jsonb;
begin
  select * into v_role from roles where id = p_role_id;
  if v_role.id is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform require_permission(v_role.org_id, 'roles.manage');
  if v_role.is_owner then raise exception 'The Owner role cannot be deleted.'; end if;
  select coalesce(jsonb_agg(member_id order by member_id), '[]') into v_members from member_roles where role_id = p_role_id;
  delete from roles where id = p_role_id;
  perform audit(v_role.org_id, 'role.delete', p_role_id::text, jsonb_build_object('name', v_role.name, 'members', v_members), null);
end $$;

-- QA-6: reject null / duplicate role ids up front.
create or replace function set_member_roles(p_member_id uuid, p_role_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := (select org_id from members where id = p_member_id);
  v_owner uuid;
  v_had_owner boolean;
  v_gets_owner boolean;
  v_before uuid[];
begin
  if v_org is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform require_permission(v_org, 'members.manage');
  if p_role_ids is null or exists (select 1 from unnest(p_role_ids) r where r is null)
     or (select count(distinct r) from unnest(p_role_ids) r) <> cardinality(p_role_ids) then
    raise exception 'Invalid roles.';
  end if;
  if exists (select 1 from unnest(p_role_ids) r where r not in (select id from roles where org_id = v_org)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select id into v_owner from roles where org_id = v_org and is_owner;
  select array_agg(role_id order by role_id) into v_before from member_roles where member_id = p_member_id;
  v_had_owner := v_owner = any(coalesce(v_before, '{}'));
  v_gets_owner := v_owner = any(p_role_ids);

  if v_had_owner <> v_gets_owner and not exists (
    select 1 from member_roles where member_id = current_member_id(v_org) and role_id = v_owner) then
    raise exception 'Only an Owner can assign the Owner role.';
  end if;
  if v_had_owner and not v_gets_owner and owner_count(v_org) <= 1 then
    raise exception 'An organisation needs at least one Owner.';
  end if;
  if exists (
    select 1 from role_permissions rp where rp.role_id = any(p_role_ids) and not has_permission(v_org, rp.permission)) then
    raise exception 'You cannot assign a role with permissions you do not hold.';
  end if;

  delete from member_roles where member_id = p_member_id;
  insert into member_roles select p_member_id, r from unnest(p_role_ids) r;
  perform audit(v_org, 'member.roles', p_member_id::text, to_jsonb(v_before), to_jsonb(p_role_ids));
end $$;

-- QA-1: only an Owner may remove an Owner.
create or replace function remove_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m members;
begin
  select * into v_m from members where id = p_member_id;
  if v_m.id is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform require_permission(v_m.org_id, 'members.manage');
  if exists (select 1 from member_roles mr join roles r on r.id = mr.role_id where mr.member_id = p_member_id and r.is_owner) then
    if not exists (select 1 from member_roles mr join roles r on r.id = mr.role_id
                   where mr.member_id = current_member_id(v_m.org_id) and r.is_owner) then
      raise exception 'Only an Owner can remove an Owner.';
    end if;
    if owner_count(v_m.org_id) <= 1 then
      raise exception 'An organisation needs at least one Owner.';
    end if;
  end if;
  delete from members where id = p_member_id;
  perform audit(v_m.org_id, 'member.remove', p_member_id::text, jsonb_build_object('email', v_m.email), null);
end $$;

-- QA-7: invite acceptance is audited, one row per membership.
create or replace function accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_m record;
  v_count int := 0;
begin
  if auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  for v_m in
    update members set user_id = auth.uid(), status = 'active'
    where status = 'invited' and email = (select email from auth.users where id = auth.uid())
    returning id, org_id, email
  loop
    perform audit(v_m.org_id, 'member.accept', v_m.id::text, null, jsonb_build_object('email', v_m.email));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
