-- SECURITY DEFINER so policies can read members/roles without recursing into their own RLS.
create or replace function current_member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where org_id = p_org and user_id = auth.uid() and status = 'active'
$$;

create or replace function is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select current_member_id(p_org) is not null
$$;

create or replace function my_permissions(p_org uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select p.key from permissions p
  where exists (
    select 1 from member_roles mr join roles r on r.id = mr.role_id
    left join role_permissions rp on rp.role_id = r.id
    where mr.member_id = current_member_id(p_org)
      and (r.is_owner or rp.permission = p.key)
  )
  order by p.key
$$;

create or replace function has_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from my_permissions(p_org) k where k = p_perm)
$$;

-- Read: every member sees their org, its members, roles and grants.
create policy orgs_read on orgs for select using (is_member(id));
create policy members_read on members for select using (is_member(org_id) or user_id = auth.uid());
create policy permissions_read on permissions for select using (auth.role() = 'authenticated');
create policy roles_read on roles for select using (is_member(org_id));
create policy role_permissions_read on role_permissions for select
  using (exists (select 1 from roles r where r.id = role_id and is_member(r.org_id)));
create policy member_roles_read on member_roles for select
  using (exists (select 1 from members m where m.id = member_id and is_member(m.org_id)));
create policy audit_read on audit_log for select
  using (has_permission(org_id, 'roles.manage') or has_permission(org_id, 'members.manage'));

-- Org rename by Owners/admins holding roles.manage.
create policy orgs_update on orgs for update
  using (has_permission(id, 'roles.manage')) with check (has_permission(id, 'roles.manage'));

-- No insert/update/delete policies on members, roles, role_permissions, member_roles, audit_log:
-- all writes go through the RPCs in 20261012000003_rbac_rpcs.sql, which enforce the guards.
