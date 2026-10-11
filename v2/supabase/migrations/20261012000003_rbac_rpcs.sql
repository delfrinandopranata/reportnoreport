create or replace function audit(p_org uuid, p_action text, p_target text, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (org_id, actor_id, action, target, before, after)
  values (p_org, auth.uid(), p_action, p_target, p_before, p_after)
$$;
revoke execute on function audit(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function require_permission(p_org uuid, p_perm text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission(p_org, p_perm) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;

create or replace function owner_count(p_org uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct mr.member_id)::int
  from member_roles mr join roles r on r.id = mr.role_id join members m on m.id = mr.member_id
  where r.org_id = p_org and r.is_owner and m.status = 'active'
$$;

create or replace function create_org(p_name text, p_id uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
  v_owner uuid;
  v_role uuid;
  v_email text := (select email from auth.users where id = auth.uid());
begin
  if auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into orgs (id, name) values (p_id, trim(p_name));
  insert into members (org_id, user_id, email, status) values (p_id, auth.uid(), v_email, 'active') returning id into v_member;
  insert into roles (org_id, name, is_system, is_owner) values (p_id, 'Owner', true, true) returning id into v_owner;
  insert into member_roles values (v_member, v_owner);

  insert into roles (org_id, name, is_system) values (p_id, 'Admin', true) returning id into v_role;
  insert into role_permissions select v_role, key from permissions;
  insert into roles (org_id, name, is_system) values (p_id, 'Member', true) returning id into v_role;
  insert into role_permissions values (v_role, 'records.start'), (v_role, 'reports.view');
  insert into roles (org_id, name, is_system) values (p_id, 'Viewer', true) returning id into v_role;
  insert into role_permissions values (v_role, 'reports.view');

  perform audit(p_id, 'org.create', p_id::text, null, jsonb_build_object('name', trim(p_name)));
  return p_id;
end $$;

create or replace function save_role(p_org uuid, p_role_id uuid, p_name text, p_permissions text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_role_id;
  v_before jsonb;
  v_lacking text;
begin
  perform require_permission(p_org, 'roles.manage');
  if exists (select 1 from roles where id = p_role_id and is_owner) then
    raise exception 'The Owner role cannot be changed.';
  end if;
  if p_role_id is not null and not exists (select 1 from roles where id = p_role_id and org_id = p_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select string_agg(p, ', ' order by p) into v_lacking
  from unnest(p_permissions) p
  where not has_permission(p_org, p);
  if v_lacking is not null then
    raise exception 'You cannot grant permissions you do not hold: %', v_lacking;
  end if;

  if v_id is null then
    insert into roles (org_id, name) values (p_org, trim(p_name)) returning id into v_id;
  else
    select jsonb_build_object('name', r.name, 'permissions', coalesce(array_agg(rp.permission order by rp.permission) filter (where rp.permission is not null), '{}'))
      into v_before from roles r left join role_permissions rp on rp.role_id = r.id where r.id = v_id group by r.name;
    update roles set name = trim(p_name) where id = v_id;
    delete from role_permissions where role_id = v_id;
  end if;
  insert into role_permissions select v_id, p from unnest(p_permissions) p on conflict do nothing;

  perform audit(p_org, case when p_role_id is null then 'role.create' else 'role.update' end, v_id::text, v_before,
    jsonb_build_object('name', trim(p_name), 'permissions', (select coalesce(array_agg(p order by p), '{}') from unnest(p_permissions) p)));
  return v_id;
end $$;

create or replace function delete_role(p_role_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_role roles;
begin
  select * into v_role from roles where id = p_role_id;
  if v_role.id is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform require_permission(v_role.org_id, 'roles.manage');
  if v_role.is_owner then raise exception 'The Owner role cannot be deleted.'; end if;
  delete from roles where id = p_role_id;
  perform audit(v_role.org_id, 'role.delete', p_role_id::text, jsonb_build_object('name', v_role.name), null);
end $$;

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
  -- Granting a role grants its permissions: same no-escalation rule as save_role.
  if exists (
    select 1 from role_permissions rp where rp.role_id = any(p_role_ids) and not has_permission(v_org, rp.permission)) then
    raise exception 'You cannot assign a role with permissions you do not hold.';
  end if;

  delete from member_roles where member_id = p_member_id;
  insert into member_roles select p_member_id, r from unnest(p_role_ids) r on conflict do nothing;
  perform audit(v_org, 'member.roles', p_member_id::text, to_jsonb(v_before), to_jsonb(p_role_ids));
end $$;

create or replace function remove_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_m members;
begin
  select * into v_m from members where id = p_member_id;
  if v_m.id is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform require_permission(v_m.org_id, 'members.manage');
  if exists (select 1 from member_roles mr join roles r on r.id = mr.role_id where mr.member_id = p_member_id and r.is_owner)
     and owner_count(v_m.org_id) <= 1 then
    raise exception 'An organisation needs at least one Owner.';
  end if;
  delete from members where id = p_member_id;
  perform audit(v_m.org_id, 'member.remove', p_member_id::text, jsonb_build_object('email', v_m.email), null);
end $$;

create or replace function accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  update members set user_id = auth.uid(), status = 'active'
  where status = 'invited' and email = (select email from auth.users where id = auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function require_permission(uuid, text), owner_count(uuid) from public, anon;
