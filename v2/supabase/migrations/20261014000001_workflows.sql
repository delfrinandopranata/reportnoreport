create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Lets workflow_access and tasks prove a role belongs to the same org.
alter table roles add constraint roles_id_org_key unique (id, org_id);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'published')),
  graph jsonb not null default '{"nodes":[],"edges":[]}'
    check (jsonb_typeof(graph->'nodes') = 'array' and jsonb_typeof(graph->'edges') = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index workflows_org_idx on workflows (org_id);

create table workflow_access (
  workflow_id uuid not null,
  org_id uuid not null,
  role_id uuid not null,
  can_start boolean not null default false,
  can_view_all boolean not null default false,
  primary key (workflow_id, role_id),
  foreign key (workflow_id, org_id) references workflows (id, org_id) on delete cascade,
  foreign key (role_id, org_id) references roles (id, org_id) on delete cascade
);

create table records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  workflow_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  current_node_id text,
  status text not null default 'open' check (status in ('open', 'done', 'rejected', 'error')),
  label text check (length(label) <= 60),
  error text,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  step int not null default 0, -- bumped on every move; scheduled_actions.state_at_schedule compares against it
  started_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (workflow_id, org_id) references workflows (id, org_id) on delete restrict
);
create index records_org_idx on records (org_id, created_at desc);
create index records_workflow_node_idx on records (workflow_id, current_node_id) where status in ('open', 'error');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  record_id uuid not null,
  node_id text not null,
  -- shortcut: a deleted role leaves its open tasks unassigned (visible to records.view_all only) until admin record tools (Phase 5).
  assignee_role_id uuid references roles(id) on delete set null,
  assignee_user_id uuid references auth.users(id) on delete set null,
  claimed_by uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  overdue_notified_at timestamptz, -- written by Phase 4's overdue sender
  created_at timestamptz not null default now(),
  done_at timestamptz,
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
-- The graph has no parallel split, so a record waits on one task at a time.
create unique index tasks_one_open_per_record on tasks (record_id) where status = 'open';
create index tasks_user_open_idx on tasks (assignee_user_id) where status = 'open';
create index tasks_role_open_idx on tasks (assignee_role_id) where status = 'open';

-- Spec §5.1 `submissions` is Phase 2's table, extended: standalone rows keep record_id/node_id null.
alter table form_submissions
  add column record_id uuid,
  add column node_id text,
  add column task_id uuid unique references tasks(id) on delete set null,
  add column outcome text not null default 'submitted' check (outcome in ('submitted', 'approved', 'rejected')),
  add constraint form_submissions_record_fkey foreign key (record_id, org_id) references records (id, org_id) on delete cascade,
  add constraint form_submissions_step_check check ((record_id is null) = (node_id is null));
create index form_submissions_record_idx on form_submissions (record_id, created_at) where record_id is not null;

create table scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  record_id uuid not null,
  resume_node_id text not null,
  run_at timestamptz not null,
  state_at_schedule int not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
create index scheduled_actions_due_idx on scheduled_actions (run_at) where status = 'pending';

create table record_events (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  record_id uuid not null,
  kind text not null check (kind in ('started', 'submitted', 'task', 'claimed', 'condition', 'waiting', 'resumed', 'skipped', 'action', 'error', 'closed')),
  node_id text,
  actor_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
create index record_events_record_idx on record_events (record_id, id);

-- Workflow-scoped check (spec §7). A separate overload, not a default argument: a default would make
-- every existing two-argument call ambiguous.
create or replace function has_permission(p_org uuid, p_perm text, p_workflow uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_permission(p_org, p_perm) and (
    p_workflow is null
    or p_perm not in ('records.start', 'records.view_all')
    or exists (select 1 from member_roles mr join roles r on r.id = mr.role_id
               where mr.member_id = current_member_id(p_org) and r.is_owner)
    or exists (select 1 from workflow_access wa join member_roles mr on mr.role_id = wa.role_id
               where wa.workflow_id = p_workflow and wa.org_id = p_org
                 and mr.member_id = current_member_id(p_org)
                 and case p_perm when 'records.start' then wa.can_start else wa.can_view_all end))
$$;

-- One rule for "may I see this record", shared by every runtime table's policy. SECURITY DEFINER so the
-- records ⇄ form_submissions ⇄ tasks references do not recurse through each other's RLS; it only ever
-- answers for the caller, so it is safe for clients to call (QA-5).
create or replace function record_visible(p_record uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from records r
    where r.id = p_record and is_member(r.org_id) and (
      r.started_by = auth.uid()
      or has_permission(r.org_id, 'records.view_all', r.workflow_id)
      or exists (select 1 from form_submissions s where s.record_id = r.id and s.submitted_by = auth.uid())
      or exists (select 1 from tasks t where t.record_id = r.id and (
            t.assignee_user_id = auth.uid() or t.claimed_by = auth.uid()
            or (t.status = 'open' and t.claimed_by is null and t.assignee_role_id in (
                  select mr.role_id from member_roles mr where mr.member_id = current_member_id(r.org_id))))))
  )
$$;

-- PostgREST computed columns (`select … can_start` / `.eq('is_mine', true)`).
create or replace function can_start(w workflows) returns boolean language sql stable as $$
  select w.status = 'published' and has_permission(w.org_id, 'records.start', w.id)
$$;
create or replace function is_mine(t tasks) returns boolean
language sql stable security definer set search_path = public as $$
  select t.status = 'open' and (
    t.assignee_user_id = auth.uid() or t.claimed_by = auth.uid()
    or (t.claimed_by is null and exists (
          select 1 from member_roles mr where mr.member_id = current_member_id(t.org_id) and mr.role_id = t.assignee_role_id)))
$$;

alter table workflows enable row level security;
alter table workflow_access enable row level security;
alter table records enable row level security;
alter table tasks enable row level security;
alter table scheduled_actions enable row level security;
alter table record_events enable row level security;

create policy workflows_read on workflows for select
  using (is_member(org_id) and (status = 'published' or has_permission(org_id, 'workflows.manage')));
create policy workflows_insert on workflows for insert with check (has_permission(org_id, 'workflows.manage'));
create policy workflows_delete on workflows for delete using (has_permission(org_id, 'workflows.manage'));
-- No update policy: save-workflow (service role) is the only writer of name, graph and status, after the publish check.

create policy workflow_access_read on workflow_access for select using (is_member(org_id));
create policy workflow_access_insert on workflow_access for insert with check (has_permission(org_id, 'workflows.manage'));
create policy workflow_access_update on workflow_access for update
  using (has_permission(org_id, 'workflows.manage')) with check (has_permission(org_id, 'workflows.manage'));
create policy workflow_access_delete on workflow_access for delete using (has_permission(org_id, 'workflows.manage'));

create policy records_read on records for select using (record_visible(id));
create policy tasks_read on tasks for select using (record_visible(record_id));
create policy scheduled_actions_read on scheduled_actions for select using (record_visible(record_id));
create policy record_events_read on record_events for select using (record_visible(record_id));
-- No insert/update/delete policies on the runtime tables: advance / resume (direct connection) are the only writers.

drop policy form_submissions_read on form_submissions;
create policy form_submissions_read on form_submissions for select
  using ((submitted_by = auth.uid() and is_member(org_id))
    or has_permission(org_id, 'forms.manage')
    or (record_id is not null and record_visible(record_id)));

create or replace function workflows_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := new.created_by;
    new.status := 'draft';
    new.graph := '{"nodes":[],"edges":[]}';
    new.published_by := null;
    new.published_at := null;
    return new;
  end if;
  if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
  if new.status = 'draft' and old.status = 'published' then raise exception 'A published workflow cannot go back to draft.'; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.status = 'published' and old.status = 'draft' then
    new.published_at := now();
    new.published_by := new.updated_by;
  else
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;
  return new;
end $$;
create trigger workflows_before_write before insert or update on workflows for each row execute function workflows_before_write();

-- Authoritative node-deletion guard (spec §5.1), whichever path writes the graph. advance holds FOR SHARE on the
-- workflow, so this sees any record that an in-flight advance moves.
create or replace function workflows_guard_steps() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_node text;
  v_n int;
begin
  select r.current_node_id, count(*)::int into v_node, v_n
  from records r
  where r.workflow_id = new.id and r.status in ('open', 'error') and r.current_node_id is not null
    and not exists (select 1 from jsonb_array_elements(new.graph->'nodes') e where e->>'id' = r.current_node_id)
  group by r.current_node_id order by r.current_node_id limit 1;
  if v_node is not null then
    raise exception 'A step with open records cannot be deleted: % (% open)', v_node, v_n;
  end if;
  return new;
end $$;
create trigger workflows_guard_steps before update of graph on workflows for each row execute function workflows_guard_steps();

-- New workflows inherit access from the roles that already hold the org-wide permissions.
create or replace function workflows_seed_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into workflow_access (workflow_id, org_id, role_id, can_start, can_view_all)
  select new.id, new.org_id, r.id,
    exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission = 'records.start'),
    exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission = 'records.view_all')
  from roles r
  where r.org_id = new.org_id and not r.is_owner
    and exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission in ('records.start', 'records.view_all'));
  return null;
end $$;
create trigger workflows_seed_access after insert on workflows for each row execute function workflows_seed_access();

-- save-workflow writes with the service role, so the actor comes from updated_by when auth.uid() is null.
create or replace function audit_workflows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (org_id, actor_id, action, target, after)
    values (new.org_id, coalesce(auth.uid(), new.created_by), 'workflow.create', new.id::text, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    insert into audit_log (org_id, actor_id, action, target, before, after)
    values (new.org_id, coalesce(auth.uid(), new.updated_by),
      case when new.status = 'published' and old.status = 'draft' then 'workflow.publish' else 'workflow.update' end, new.id::text,
      jsonb_build_object('name', old.name, 'status', old.status, 'steps', jsonb_array_length(old.graph->'nodes')),
      jsonb_build_object('name', new.name, 'status', new.status, 'steps', jsonb_array_length(new.graph->'nodes')));
  else
    insert into audit_log (org_id, actor_id, action, target, before)
    values (old.org_id, auth.uid(), 'workflow.delete', old.id::text, jsonb_build_object('name', old.name));
  end if;
  return null;
end $$;
create trigger workflows_audit after insert or update or delete on workflows for each row execute function audit_workflows();

create or replace function audit_workflow_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if; -- rows seeded by workflows_seed_access belong to workflow.create
  perform audit(coalesce(new.org_id, old.org_id), 'workflow.access', coalesce(new.workflow_id, old.workflow_id)::text,
    case when tg_op = 'INSERT' then null else jsonb_build_object('role', old.role_id, 'can_start', old.can_start, 'can_view_all', old.can_view_all) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('role', new.role_id, 'can_start', new.can_start, 'can_view_all', new.can_view_all) end);
  return null;
end $$;
create trigger workflow_access_audit after insert or update or delete on workflow_access for each row execute function audit_workflow_access();

revoke execute on function workflows_before_write(), workflows_guard_steps(), workflows_seed_access(), audit_workflows(), audit_workflow_access()
  from public, anon, authenticated;

create or replace function claim_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t tasks;
begin
  select * into v_t from tasks where id = p_task;
  if v_t.id is null or not is_member(v_t.org_id) or v_t.assignee_role_id is null
     or not exists (select 1 from member_roles where member_id = current_member_id(v_t.org_id) and role_id = v_t.assignee_role_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update tasks set claimed_by = auth.uid() where id = p_task and status = 'open' and claimed_by is null;
  if not found then raise exception 'This task was already claimed or completed.'; end if;
  insert into record_events (org_id, record_id, kind, node_id, actor_id) values (v_t.org_id, v_t.record_id, 'claimed', v_t.node_id, auth.uid());
  perform audit(v_t.org_id, 'task.claim', p_task::text, null, jsonb_build_object('record', v_t.record_id));
end $$;

create or replace function open_record_counts(p_workflow uuid) returns table (node_id text, n int)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := (select org_id from workflows where id = p_workflow);
begin
  if v_org is null or not has_permission(v_org, 'workflows.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select r.current_node_id, count(*)::int from records r
    where r.workflow_id = p_workflow and r.status in ('open', 'error') and r.current_node_id is not null
    group by r.current_node_id;
end $$;
revoke execute on function claim_task(uuid), open_record_counts(uuid) from public, anon;

-- Every minute: wake `resume` when a timer is due. URL and secret live in Vault (seed.sql locally, README for hosted).
select cron.schedule('resume-workflows', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'resume_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
  where exists (select 1 from public.scheduled_actions where status = 'pending' and run_at <= now())
$cron$);
