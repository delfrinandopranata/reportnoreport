-- Phase 5: report templates and PDF jobs (spec §9.1), saved reports (§9.2), the dashboard (§9.3).

create table report_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  workflow_id uuid not null unique, -- one template per workflow (spec §13: never several)
  header text not null default '' check (length(header) <= 2000),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 100),
  signoff jsonb not null default '[]' check (jsonb_typeof(signoff) = 'array' and jsonb_array_length(signoff) <= 20),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workflow_id, org_id) references workflows (id, org_id) on delete cascade
);

create table record_pdfs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  record_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null, -- null when a workflow action queued it
  status text not null default 'queued' check (status in ('queued', 'done', 'failed')),
  attempts int not null default 0 check (attempts between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  path text check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  error text check (length(error) <= 500),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'done') = (path is not null)),
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
create index record_pdfs_record_idx on record_pdfs (record_id, created_at desc);
create index record_pdfs_due_idx on record_pdfs (next_attempt_at) where status = 'queued';
create unique index record_pdfs_one_queued on record_pdfs (record_id) where status = 'queued';

create table saved_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  workflow_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  columns jsonb not null default '[]' check (jsonb_typeof(columns) = 'array'),
  filters jsonb not null default '[]' check (jsonb_typeof(filters) = 'array'),
  group_by jsonb check (group_by is null or jsonb_typeof(group_by) = 'object'),
  aggregate jsonb check (aggregate is null or jsonb_typeof(aggregate) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (workflow_id, org_id) references workflows (id, org_id) on delete cascade
);
create index saved_reports_org_idx on saved_reports (org_id, name);

create table dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  report_id uuid not null,
  kind text not null check (kind in ('number', 'table', 'bar', 'line')),
  title text not null check (length(btrim(title)) between 1 and 80),
  span int not null default 1 check (span in (1, 2, 4)), -- design/README: widgets span 1, 2 or 4 columns
  position int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (report_id, org_id) references saved_reports (id, org_id) on delete cascade
);
create index dashboard_widgets_org_idx on dashboard_widgets (org_id, position);

alter table report_templates enable row level security;
alter table record_pdfs enable row level security;
alter table saved_reports enable row level security;
alter table dashboard_widgets enable row level security;

create policy report_templates_read on report_templates for select
  using (has_permission(org_id, 'reports.view') or has_permission(org_id, 'reports.manage'));
create policy report_templates_insert on report_templates for insert with check (has_permission(org_id, 'reports.manage'));
create policy report_templates_update on report_templates for update
  using (has_permission(org_id, 'reports.manage')) with check (has_permission(org_id, 'reports.manage'));
create policy report_templates_delete on report_templates for delete using (has_permission(org_id, 'reports.manage'));

-- A job is part of its record: whoever sees the record sees whether its PDF is ready.
create policy record_pdfs_read on record_pdfs for select using (record_visible(record_id));
-- No write policies: advance and request_record_pdf queue, render-pdfs (direct connection) finishes.

create policy saved_reports_read on saved_reports for select
  using (has_permission(org_id, 'reports.view') or has_permission(org_id, 'reports.manage'));
create policy saved_reports_insert on saved_reports for insert with check (has_permission(org_id, 'reports.manage'));
create policy saved_reports_update on saved_reports for update
  using (has_permission(org_id, 'reports.manage')) with check (has_permission(org_id, 'reports.manage'));
create policy saved_reports_delete on saved_reports for delete using (has_permission(org_id, 'reports.manage'));

create policy dashboard_widgets_read on dashboard_widgets for select
  using (has_permission(org_id, 'reports.view') or has_permission(org_id, 'reports.manage'));
create policy dashboard_widgets_insert on dashboard_widgets for insert with check (has_permission(org_id, 'reports.manage'));
create policy dashboard_widgets_delete on dashboard_widgets for delete using (has_permission(org_id, 'reports.manage'));
-- No update policy: order and width change only through save_dashboard_layout.

create or replace function reports_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
    new.created_at := old.created_at;
  end if;
  if tg_table_name = 'saved_reports' and tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger report_templates_before_write before insert or update on report_templates
  for each row execute function reports_before_write();
create trigger saved_reports_before_write before insert or update on saved_reports
  for each row execute function reports_before_write();

create or replace function audit_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text := case tg_table_name when 'report_templates' then 'report_template' when 'saved_reports' then 'report' else 'widget' end;
  v_op text := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
begin
  perform audit(coalesce(new.org_id, old.org_id), v_kind || '.' || v_op, coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'org_id' end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) - 'org_id' end);
  return null;
end $$;
create trigger report_templates_audit after insert or update or delete on report_templates
  for each row execute function audit_reports();
create trigger saved_reports_audit after insert or update or delete on saved_reports
  for each row execute function audit_reports();
-- Layout moves are audited once by save_dashboard_layout, not per row.
create trigger dashboard_widgets_audit after insert or delete on dashboard_widgets
  for each row execute function audit_reports();

-- PDFs: <org_id>/<record_id>/<job_id>.pdf, private; only the service role writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-pdfs', 'record-pdfs', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- Plain SQL like storage_path_org: the record folder of a PDF path, null when the path is not ours.
create or replace function storage_path_record(p_name text) returns uuid language sql immutable as $$
  select case when p_name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_name, '/', 2)::uuid end
$$;

create policy record_pdfs_read on storage.objects for select to authenticated
  using (bucket_id = 'record-pdfs'
    and public.record_visible(public.storage_path_record(name))
    and public.storage_path_org(name) = (select r.org_id from public.records r where r.id = public.storage_path_record(name)));
-- No insert/update/delete policies on record-pdfs: render-pdfs uploads with the service role.

-- Wakes render-pdfs now instead of at the next cron minute. pg_net sends after commit, so a rolled-back step never wakes it.
create or replace function wake_render_pdfs() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'render_pdfs_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb);
end $$;

create or replace function request_record_pdf(p_record uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_r records; v_id uuid;
begin
  select * into v_r from records where id = p_record;
  if v_r.id is null or not record_visible(p_record) or not has_permission(v_r.org_id, 'reports.view') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from report_templates where workflow_id = v_r.workflow_id) then
    raise exception 'This workflow has no report template yet.';
  end if;
  insert into record_pdfs (org_id, record_id, requested_by) values (v_r.org_id, p_record, auth.uid())
  on conflict (record_id) where status = 'queued' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from record_pdfs where record_id = p_record and status = 'queued';
    return v_id; -- already queued: no second audit row or wake-up
  end if;
  perform audit(v_r.org_id, 'record.pdf_request', p_record::text, null, jsonb_build_object('job', v_id));
  perform wake_render_pdfs();
  return v_id;
end $$;

create or replace function save_dashboard_layout(p_org uuid, p_layout jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not has_permission(p_org, 'reports.manage') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_layout) <> 'array'
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
  perform audit(p_org, 'dashboard.layout', p_org::text, v_before, p_layout);
end $$;

revoke execute on function wake_render_pdfs(), reports_before_write(), audit_reports() from public, anon, authenticated;
revoke execute on function request_record_pdf(uuid), save_dashboard_layout(uuid, jsonb) from public, anon;

-- Every minute: pick up retries and anything a missed wake-up left behind.
select cron.schedule('render-pdfs', '* * * * *', $cron$
  select public.wake_render_pdfs()
  where exists (select 1 from public.record_pdfs where status = 'queued' and next_attempt_at <= now())
$cron$);
