-- SECURITY INVOKER: RLS on clients/transactions limits results to the caller's firm.
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
$$;

create or replace function ledger_lines(p_from date, p_to date, p_client uuid default null, p_bank_account uuid default null, p_per_client boolean default false)
returns table (id uuid, client_id uuid, bank_account_id uuid, kind txn_kind, amount_minor bigint, date date,
               description text, created_at timestamptz, updated_at timestamptz, balance bigint)
language sql stable security invoker set search_path = public as $$
  select x.* from (
    select t.id, t.client_id, t.bank_account_id, t.kind, t.amount_minor, t.date, t.description, t.created_at, t.updated_at,
      (sum(case t.kind when 'receipt' then t.amount_minor else -t.amount_minor end)
         over (partition by case when p_per_client then t.client_id end
               order by t.date, t.created_at, t.id rows unbounded preceding))::bigint
    from transactions t
    where (p_client is null or t.client_id = p_client)
      and (p_bank_account is null or t.bank_account_id = p_bank_account)
      and t.date <= p_to
  ) x
  where x.date >= p_from
  order by x.date, x.created_at, x.id
$$;
