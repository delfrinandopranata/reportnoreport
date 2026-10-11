-- QA-P6-3: a run killed by the runtime's CPU or memory limit rolls back everything, so only a counter written before the
-- work can show that it happened. send-campaigns takes a short lease and spends an attempt first; after three the
-- campaign is failed with a reason instead of staying scheduled forever.
alter table campaigns
  add column attempts int not null default 0 check (attempts >= 0),
  add column claimed_until timestamptz;

-- Same function as in 20261018000001, plus the reset: scheduling again after a failure starts afresh.
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
  update campaigns set status = 'scheduled', scheduled_at = v_at, sent_by = auth.uid(), error = null, attempts = 0, claimed_until = null
  where id = p_campaign;
  perform audit(v_c.org_id, 'campaign.schedule', p_campaign::text, null, jsonb_build_object('scheduled_at', v_at));
  if v_at <= now() then perform wake_send_campaigns(); end if; -- pg_net sends after commit
end $$;
revoke execute on function schedule_campaign(uuid, timestamptz) from public, anon;
