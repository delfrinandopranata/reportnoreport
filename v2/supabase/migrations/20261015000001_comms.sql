-- Phase 4 (spec §8): message templates, the outgoing email queue, in-app notifications and email preferences.

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  -- 'custom', or the system template this row is; keys notification_prefs.type and lets the engine find "Task assigned".
  kind text not null default 'custom'
    check (kind in ('custom', 'task_assigned', 'task_overdue', 'record_approved', 'record_rejected', 'invite')),
  name text not null check (length(btrim(name)) between 1 and 120),
  channel text not null default 'email' check (channel in ('email', 'in_app')),
  subject text not null check (length(btrim(subject)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 10000),
  is_system boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_system = (kind <> 'custom'))
);
create unique index message_templates_system_kind on message_templates (org_id, kind) where is_system;
create index message_templates_org_idx on message_templates (org_id, name);

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  template_id uuid references message_templates(id) on delete set null,
  campaign_id uuid, -- Phase 6 adds campaigns and this foreign key
  record_id uuid,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email citext not null check (length(recipient_email) between 3 and 320),
  channel text not null default 'email' check (channel in ('email', 'in_app')),
  subject text not null check (length(subject) between 1 and 200),
  body_html text not null,
  body_text text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts int not null default 0 check (attempts between 0 and 4), -- the first try plus 3 retries
  next_attempt_at timestamptz not null default now(),
  error text check (length(error) <= 500),
  provider_id text,
  sent_at timestamptz,
  -- Tracking columns written by Phase 6's Resend webhook; nothing writes them yet.
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (record_id, org_id) references records (id, org_id) on delete cascade
);
create index messages_org_idx on messages (org_id, created_at desc);
create index messages_due_idx on messages (next_attempt_at) where status = 'queued';

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  kind text not null,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 2000),
  link text not null check (link ~ '^#/[A-Za-z0-9/_-]*$'), -- an in-app hash only, never another site
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, org_id, created_at desc);
create index notifications_unread_idx on notifications (user_id, org_id) where read_at is null;

create table notification_prefs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('task_assigned', 'task_overdue', 'record_approved', 'record_rejected', 'custom')),
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

-- send-messages looks for open tasks past due that have not been reminded.
create index tasks_overdue_idx on tasks (due_at) where status = 'open' and overdue_notified_at is null;

alter table message_templates enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table notification_prefs enable row level security;

-- Templates are not secret: workflow managers pick them in the Send message action.
create policy message_templates_read on message_templates for select using (is_member(org_id));
create policy message_templates_insert on message_templates for insert
  with check (has_permission(org_id, 'comms.manage') and not is_system and kind = 'custom');
create policy message_templates_update on message_templates for update
  using (has_permission(org_id, 'comms.manage')) with check (has_permission(org_id, 'comms.manage'));
create policy message_templates_delete on message_templates for delete
  using (has_permission(org_id, 'comms.manage') and not is_system);

create policy messages_read on messages for select using (has_permission(org_id, 'comms.manage'));
-- No write policies on messages: advance, send-messages and invite-member (service role / direct connection) write it,
-- and retry_message below is the one client path.

-- Realtime applies these policies per subscriber, so a user is only ever sent their own rows.
create policy notifications_read on notifications for select using (user_id = auth.uid() and is_member(org_id));
create policy notifications_update on notifications for update
  using (user_id = auth.uid() and is_member(org_id)) with check (user_id = auth.uid());
revoke update on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;

create policy notification_prefs_own on notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function message_templates_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
    if new.kind is distinct from old.kind or new.is_system is distinct from old.is_system then
      raise exception 'A template cannot change its type.';
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger message_templates_before_write before insert or update on message_templates
  for each row execute function message_templates_before_write();

create or replace function audit_message_templates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if; -- templates seeded with a new org belong to org.create
  perform audit(coalesce(new.org_id, old.org_id),
    case tg_op when 'INSERT' then 'template.create' when 'UPDATE' then 'template.update' else 'template.delete' end,
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else jsonb_build_object('name', old.name, 'channel', old.channel, 'subject', old.subject) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('name', new.name, 'channel', new.channel, 'subject', new.subject) end);
  return null;
end $$;
create trigger message_templates_audit after insert or update or delete on message_templates
  for each row execute function audit_message_templates();

create or replace function seed_message_templates(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into message_templates (org_id, kind, name, channel, subject, body, is_system) values
    (p_org, 'task_assigned', 'Task assigned', 'email', 'New task: {{record.title}}',
     E'Hello {{recipient.name}},\n\nThere is a new task on "{{record.title}}" for {{step.assignee.name}}.\n\nOpen the task: {{link.task}}\n\n{{org.name}}', true),
    (p_org, 'task_overdue', 'Task overdue', 'email', 'Overdue: {{record.title}}',
     E'Hello {{recipient.name}},\n\nThe task on "{{record.title}}" for {{step.assignee.name}} is past its due time.\n\nOpen the task: {{link.task}}\n\n{{org.name}}', true),
    (p_org, 'record_approved', 'Record approved', 'email', 'Approved: {{record.title}}',
     E'Hello {{recipient.name}},\n\n"{{record.title}}" was approved by {{step.assignee.name}}.\n\nSee the record: {{link.record}}\n\n{{org.name}}', true),
    (p_org, 'record_rejected', 'Record rejected', 'email', 'Rejected: {{record.title}}',
     E'Hello {{recipient.name}},\n\n"{{record.title}}" was rejected by {{step.assignee.name}}.\n\nSee the record: {{link.record}}\n\n{{org.name}}', true),
    (p_org, 'invite', 'Invite to org', 'email', 'You are invited to join {{org.name}}',
     E'Hello,\n\nYou have been invited to join {{org.name}} on ReportNoReport.\n\nSign in or create an account with this email address to accept: {{link.invite}}', true)
  on conflict (org_id, kind) where is_system do nothing
$$;

create or replace function orgs_seed_templates() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform seed_message_templates(new.id);
  return null;
end $$;
create trigger orgs_seed_templates after insert on orgs for each row execute function orgs_seed_templates();

select seed_message_templates(id) from orgs;

revoke execute on function seed_message_templates(uuid), orgs_seed_templates(), message_templates_before_write(), audit_message_templates()
  from public, anon, authenticated;

create or replace function retry_message(p_message uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_m messages;
begin
  select * into v_m from messages where id = p_message for update;
  if v_m.id is null or not has_permission(v_m.org_id, 'comms.manage') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_m.status <> 'failed' then raise exception 'Only failed messages can be retried.'; end if;
  update messages set status = 'queued', attempts = 0, error = null, next_attempt_at = now() where id = p_message;
  perform audit(v_m.org_id, 'message.retry', p_message::text, jsonb_build_object('attempts', v_m.attempts, 'error', v_m.error), null);
end $$;
revoke execute on function retry_message(uuid) from public, anon;

alter publication supabase_realtime add table notifications;

-- Every minute: wake send-messages when an email is due or a task has gone overdue unreminded.
select cron.schedule('send-messages', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'send_messages_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
  where exists (select 1 from public.messages where status = 'queued' and next_attempt_at <= now())
     or exists (select 1 from public.tasks where status = 'open' and overdue_notified_at is null and due_at <= now())
$cron$);
