-- Stable order so .range() paging over client_balances is deterministic.
create or replace function client_balances(p_from date, p_to date, p_bank_account uuid default null, p_client uuid default null)
returns table (client_id uuid, opening bigint, receipts bigint, payments bigint, closing bigint, txn_count int, last_txn_date date)
language sql stable security invoker set search_path = public as $$
  select c.id,
    coalesce(sum(case when t.date < p_from then case t.kind when 'receipt' then t.amount_minor else -t.amount_minor end end), 0)::bigint,
    coalesce(sum(case when t.date between p_from and p_to and t.kind = 'receipt' then t.amount_minor end), 0)::bigint,
    coalesce(sum(case when t.date between p_from and p_to and t.kind = 'payment' then t.amount_minor end), 0)::bigint,
    coalesce(sum(case when t.date <= p_to then case t.kind when 'receipt' then t.amount_minor else -t.amount_minor end end), 0)::bigint,
    (count(t.id) filter (where t.date between p_from and p_to))::int,
    max(t.date) filter (where t.date <= p_to)
  from clients c
  left join transactions t on t.client_id = c.id and (p_bank_account is null or t.bank_account_id = p_bank_account)
  where p_client is null or c.id = p_client
  group by c.id
  order by c.id
$$;
