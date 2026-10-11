-- "Send follow-up to not opened" must show exactly when someone would receive it. That audience excludes bounced and
-- complained addresses, which cannot be derived from the other counts (a complaint may follow an open), so it is counted here.
drop function campaign_stats(uuid);
create function campaign_stats(p_org uuid) returns table (
  campaign_id uuid, recipients int, queued int, sent int, failed int, delivered int, opened int, clicked int, bounced int, complained int, not_opened int)
language sql stable security invoker set search_path = public as $$
  select m.campaign_id, count(*)::int,
    count(*) filter (where m.status = 'queued')::int, count(*) filter (where m.status = 'sent')::int,
    count(*) filter (where m.status = 'failed')::int, count(m.delivered_at)::int, count(m.opened_at)::int,
    count(m.clicked_at)::int, count(m.bounced_at)::int, count(m.complained_at)::int,
    count(*) filter (where m.status = 'sent' and m.opened_at is null and m.bounced_at is null and m.complained_at is null)::int
  from messages m where m.org_id = p_org and m.campaign_id is not null
  group by m.campaign_id
$$;
revoke execute on function campaign_stats(uuid) from public, anon;
