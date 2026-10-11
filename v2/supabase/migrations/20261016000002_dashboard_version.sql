-- A version per org dashboard so any change (reorder, resize, add, remove) is a conflict for a stale tab.
-- No row yet means version 0.
create table dashboard_versions (
  org_id uuid primary key references orgs(id) on delete cascade,
  version bigint not null default 0
);
alter table dashboard_versions enable row level security;
create policy dashboard_versions_read on dashboard_versions for select
  using (has_permission(org_id, 'reports.view') or has_permission(org_id, 'reports.manage'));
-- No write policies: only the trigger and save_dashboard_layout bump it.

create or replace function bump_dashboard_version(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into dashboard_versions (org_id, version) values (p_org, 1)
  on conflict (org_id) do update set version = dashboard_versions.version + 1
$$;

create or replace function dashboard_widgets_bump() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform bump_dashboard_version(coalesce(new.org_id, old.org_id));
  return null;
end $$;
create trigger dashboard_widgets_bump after insert or delete on dashboard_widgets
  for each row execute function dashboard_widgets_bump();

drop function save_dashboard_layout(uuid, jsonb);
create or replace function save_dashboard_layout(p_org uuid, p_layout jsonb, p_version bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not has_permission(p_org, 'reports.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform 1 from dashboard_versions where org_id = p_org for update; -- two saves at one version cannot both pass
  if coalesce((select version from dashboard_versions where org_id = p_org), 0) is distinct from p_version
     or jsonb_typeof(p_layout) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_layout) e
                where jsonb_typeof(e->'id') <> 'string' or coalesce(e->>'span', '') not in ('1', '2', '4'))
     or (select array_agg((e->>'id') order by e->>'id') from jsonb_array_elements(p_layout) e)
        is distinct from (select array_agg(id::text order by id::text) from dashboard_widgets where org_id = p_org)
  then
    raise exception 'The dashboard changed. Reload to see the latest layout.';
  end if;
  select jsonb_agg(jsonb_build_object('id', id, 'span', span) order by position) into v_before from dashboard_widgets where org_id = p_org;
  update dashboard_widgets w set position = l.ord, span = (l.e->>'span')::int
  from jsonb_array_elements(p_layout) with ordinality l(e, ord)
  where w.org_id = p_org and w.id = (l.e->>'id')::uuid;
  perform bump_dashboard_version(p_org);
  perform audit(p_org, 'dashboard.layout', p_org::text, v_before, p_layout);
end $$;

revoke execute on function bump_dashboard_version(uuid), dashboard_widgets_bump() from public, anon, authenticated;
revoke execute on function save_dashboard_layout(uuid, jsonb, bigint) from public, anon;
