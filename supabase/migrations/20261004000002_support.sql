-- Support access: read client balances for a specific firm via service role only.
create or replace function support_client_balances(p_firm uuid, p_from date, p_to date)
returns table (client_id uuid, opening bigint, receipts bigint, payments bigint, closing bigint, txn_count int, last_txn_date date)
language sql stable security definer set search_path = public as $$
  select c.id,
    coalesce(sum(case when t.date < p_from then case t.kind when 'receipt' then t.amount_minor else -t.amount_minor end end), 0)::bigint,
    coalesce(sum(case when t.date between p_from and p_to and t.kind = 'receipt' then t.amount_minor end), 0)::bigint,
    coalesce(sum(case when t.date between p_from and p_to and t.kind = 'payment' then t.amount_minor end), 0)::bigint,
    coalesce(sum(case when t.date <= p_to then case t.kind when 'receipt' then t.amount_minor else -t.amount_minor end end), 0)::bigint,
    (count(t.id) filter (where t.date between p_from and p_to))::int,
    max(t.date) filter (where t.date <= p_to)
  from clients c
  left join transactions t on t.client_id = c.id and t.firm_id = p_firm
  where c.firm_id = p_firm
  group by c.id
  order by c.id
$$;

revoke execute on function support_client_balances(uuid, date, date) from public, anon, authenticated;
grant execute on function support_client_balances(uuid, date, date) to service_role;
