-- Phase 6 (spec §8.1): campaigns, per-organisation email opt-outs, campaign stats and the send-campaigns wake-up.

alter table message_templates add constraint message_templates_id_org_key unique (id, org_id);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  template_id uuid,
  audience jsonb not null default '{}' check (jsonb_typeof(audience) = 'object' and pg_column_size(audience) <= 2000),
  linked_workflow_id uuid,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null, -- who scheduled it: the audience is read with this person's visibility
  audience_snapshot_at timestamptz,
  channel text check (channel in ('email', 'in_app')),       -- the template's channel when the audience was taken
  recipients int check (recipients >= 0),
  excluded jsonb not null default '{}' check (jsonb_typeof(excluded) = 'object'),
  error text check (length(error) <= 500),
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  check (status = 'draft' or scheduled_at is not null),
  foreign key (template_id, org_id) references message_templates (id, org_id) on delete set null (template_id),
  foreign key (linked_workflow_id, org_id) references workflows (id, org_id) on delete set null (linked_workflow_id)
);
create index campaigns_org_idx on campaigns (org_id, created_at desc);
create index campaigns_due_idx on campaigns (scheduled_at) where status = 'scheduled';

alter table messages
  add column unsubscribe_url text check (length(unsubscribe_url) <= 500 and unsubscribe_url ~ '^https?://[^\s]+$'),
  add constraint messages_campaign_fk foreign key (campaign_id, org_id) references campaigns (id, org_id) on delete cascade;
-- One message per address per campaign: a second insert can never double-send, whatever else goes wrong.
create unique index messages_campaign_recipient on messages (campaign_id, recipient_email) where campaign_id is not null;
create index messages_provider_idx on messages (provider_id) where provider_id is not null;

alter table notifications
  add column campaign_id uuid,
  add constraint notifications_campaign_fk foreign key (campaign_id, org_id) references campaigns (id, org_id) on delete cascade;

-- Per organisation and by address (decision 5): report audiences include addresses that have no account.
create table email_optouts (
  org_id uuid not null references orgs(id) on delete cascade,
  email citext not null check (length(email) between 3 and 320),
  reason text not null check (reason in ('unsubscribe', 'complaint', 'settings')),
  created_at timestamptz not null default now(),
  primary key (org_id, email)
);

alter table campaigns enable row level security;
alter table email_optouts enable row level security;

create policy campaigns_read on campaigns for select using (has_permission(org_id, 'comms.broadcast'));
create policy campaigns_insert on campaigns for insert with check (has_permission(org_id, 'comms.broadcast') and status = 'draft');
create policy campaigns_update on campaigns for update
  using (has_permission(org_id, 'comms.broadcast') and status = 'draft')
  with check (has_permission(org_id, 'comms.broadcast') and status = 'draft');
create policy campaigns_delete on campaigns for delete using (has_permission(org_id, 'comms.broadcast') and status = 'draft');
-- Status, sender and results are written only by schedule_campaign, cancel_campaign and send-campaigns.
revoke insert, update on campaigns from anon, authenticated;
grant insert (id, org_id, name, template_id, audience, linked_workflow_id) on campaigns to authenticated;
grant update (name, template_id, audience, linked_workflow_id) on campaigns to authenticated;

create policy messages_campaign_read on messages for select
  using (campaign_id is not null and has_permission(org_id, 'comms.broadcast'));

create or replace function my_member_email(p_org uuid) returns citext
language sql stable security definer set search_path = public as $$
  select email from members where org_id = p_org and user_id = auth.uid() and status = 'active'
$$;

create policy email_optouts_read on email_optouts for select
  using (has_permission(org_id, 'comms.broadcast') or email = my_member_email(org_id));
create policy email_optouts_own_insert on email_optouts for insert
  with check (reason = 'settings' and email = my_member_email(org_id));
create policy email_optouts_own_delete on email_optouts for delete using (email = my_member_email(org_id));
-- No update policy; unsubscribe and resend-webhook insert with the direct connection.

create or replace function campaigns_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  else
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  if new.linked_workflow_id is not null and auth.uid() is not null
     and (tg_op = 'INSERT' or new.linked_workflow_id is distinct from old.linked_workflow_id)
     and not has_permission(new.org_id, 'records.view_all', new.linked_workflow_id) then
    raise exception 'You can only link a workflow whose records you can all see.';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger campaigns_before_write before insert or update on campaigns for each row execute function campaigns_before_write();

-- Draft edits by trigger; scheduling and cancelling are audited by their RPCs; send-campaigns' status moves are not client writes.
create or replace function audit_campaigns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not (old.status = 'draft' and new.status = 'draft') then return null; end if;
  perform audit(coalesce(new.org_id, old.org_id),
    case tg_op when 'INSERT' then 'campaign.create' when 'UPDATE' then 'campaign.update' else 'campaign.delete' end,
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else jsonb_build_object('name', old.name, 'template_id', old.template_id, 'audience', old.audience) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object('name', new.name, 'template_id', new.template_id, 'audience', new.audience) end);
  return null;
end $$;
create trigger campaigns_audit after insert or update or delete on campaigns for each row execute function audit_campaigns();

-- In-app campaigns: reading the notice is the "open" (decision 8).
create or replace function notifications_campaign_read() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update messages set opened_at = coalesce(opened_at, new.read_at)
  where campaign_id = new.campaign_id and recipient_user_id = new.user_id and channel = 'in_app';
  return null;
end $$;
create trigger notifications_campaign_read after update of read_at on notifications
  for each row when (new.campaign_id is not null and new.read_at is not null and old.read_at is null)
  execute function notifications_campaign_read();

create or replace function wake_send_campaigns() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'send_campaigns_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb);
end $$;

create or replace function schedule_campaign(p_campaign uuid, p_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_c campaigns; v_at timestamptz := coalesce(p_at, now());
begin
  select * into v_c from campaigns where id = p_campaign for update;
  if v_c.id is null or not has_permission(v_c.org_id, 'comms.broadcast') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_c.status <> 'draft' then raise exception 'Only a draft campaign can be scheduled.'; end if;
  if v_c.template_id is null then raise exception 'Choose a message template before sending.'; end if;
  if coalesce(v_c.audience->>'kind', '') not in ('role', 'report', 'followup') then
    raise exception 'Choose who receives this campaign before sending.';
  end if;
  if v_at < now() - interval '1 minute' then raise exception 'Choose a time in the future.'; end if;
  if v_at > now() + interval '1 year' then raise exception 'Choose a time within the next year.'; end if;
  update campaigns set status = 'scheduled', scheduled_at = v_at, sent_by = auth.uid(), error = null where id = p_campaign;
  perform audit(v_c.org_id, 'campaign.schedule', p_campaign::text, null, jsonb_build_object('scheduled_at', v_at));
  if v_at <= now() then perform wake_send_campaigns(); end if; -- pg_net sends after commit
end $$;

create or replace function cancel_campaign(p_campaign uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_c campaigns;
begin
  select * into v_c from campaigns where id = p_campaign for update;
  if v_c.id is null or not has_permission(v_c.org_id, 'comms.broadcast') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v_c.status not in ('scheduled', 'failed') then raise exception 'This campaign has started sending and cannot be changed.'; end if;
  update campaigns set status = 'draft', scheduled_at = null, error = null where id = p_campaign;
  perform audit(v_c.org_id, 'campaign.cancel', p_campaign::text, jsonb_build_object('status', v_c.status, 'error', v_c.error), null);
end $$;

-- Counted in SQL so no PostgREST page cap can shorten them (decision 7). RLS decides who gets rows.
create or replace function campaign_stats(p_org uuid) returns table (
  campaign_id uuid, recipients int, queued int, sent int, failed int, delivered int, opened int, clicked int, bounced int, complained int)
language sql stable security invoker set search_path = public as $$
  select m.campaign_id, count(*)::int,
    count(*) filter (where m.status = 'queued')::int, count(*) filter (where m.status = 'sent')::int,
    count(*) filter (where m.status = 'failed')::int, count(m.delivered_at)::int, count(m.opened_at)::int,
    count(m.clicked_at)::int, count(m.bounced_at)::int, count(m.complained_at)::int
  from messages m where m.org_id = p_org and m.campaign_id is not null
  group by m.campaign_id
$$;

create or replace function campaign_daily(p_campaign uuid) returns table (day int, opens int, clicks int)
language sql stable security invoker set search_path = public as $$
  with c as (select audience_snapshot_at as t0 from campaigns where id = p_campaign and audience_snapshot_at is not null)
  select d.day,
    (select count(*) from messages m where m.campaign_id = p_campaign
       and m.opened_at >= c.t0 + d.day * interval '1 day' and m.opened_at < c.t0 + (d.day + 1) * interval '1 day')::int,
    (select count(*) from messages m where m.campaign_id = p_campaign
       and m.clicked_at >= c.t0 + d.day * interval '1 day' and m.clicked_at < c.t0 + (d.day + 1) * interval '1 day')::int
  from c, generate_series(0, 6) d(day)
  order by d.day
$$;

-- Definer, so it can count every record of the linked workflow; it refuses anyone who could not see them all.
create or replace function campaign_completion(p_campaign uuid) returns table (people int, started int, finished int)
language plpgsql stable security definer set search_path = public as $$
declare v_c campaigns;
begin
  select * into v_c from campaigns where id = p_campaign;
  if v_c.id is null or v_c.linked_workflow_id is null or v_c.audience_snapshot_at is null
     or not has_permission(v_c.org_id, 'comms.broadcast')
     or not has_permission(v_c.org_id, 'records.view_all', v_c.linked_workflow_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with people as (select distinct recipient_user_id as u from messages where campaign_id = p_campaign and recipient_user_id is not null),
       recs as (select r.started_by, bool_or(r.status = 'done') as done from records r
                where r.workflow_id = v_c.linked_workflow_id and r.created_at >= v_c.audience_snapshot_at group by r.started_by)
  select (select count(*) from people)::int,
         (select count(*) from people p join recs on recs.started_by = p.u)::int,
         (select count(*) from people p join recs on recs.started_by = p.u and recs.done)::int;
end $$;

revoke execute on function wake_send_campaigns(), campaigns_before_write(), audit_campaigns(), notifications_campaign_read()
  from public, anon, authenticated;
revoke execute on function schedule_campaign(uuid, timestamptz), cancel_campaign(uuid), campaign_stats(uuid), campaign_daily(uuid),
  campaign_completion(uuid), my_member_email(uuid) from public, anon;

-- Every minute: start campaigns that are due (schedule_campaign also wakes it at once for "Send now").
select cron.schedule('send-campaigns', '* * * * *', $cron$
  select public.wake_send_campaigns()
  where exists (select 1 from public.campaigns where status = 'scheduled' and scheduled_at <= now())
$cron$);
