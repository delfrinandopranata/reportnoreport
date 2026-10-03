-- Removing sample data used to refuse outright if the firm had posted any of its own
-- transactions to a sample client, with a raw "permission denied" message that read as
-- a broken button. A sample client is going away regardless, so everything recorded
-- against it goes with it (contracts and attachments already cascade). The sample bank
-- account is only removed if nothing else still uses it, instead of failing on the FK.
create or replace function remove_sample_data() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_firm_id uuid := auth_firm_id();
begin
  if not auth_can('settings.manage') then
    raise exception 'Only an owner or admin can remove sample data.' using errcode = 'P0001';
  end if;
  if not firm_can_write(v_firm_id) then
    raise exception 'Your firm can''t make changes right now: %', firm_write_block_reason(v_firm_id) using errcode = 'P0001';
  end if;

  delete from transactions
  where firm_id = v_firm_id
    and (is_sample or client_id in (select id from clients where firm_id = v_firm_id and is_sample));

  delete from clients where firm_id = v_firm_id and is_sample;

  delete from bank_accounts b
  where b.firm_id = v_firm_id and b.is_sample
    and not exists (select 1 from transactions t where t.bank_account_id = b.id);
end $$;

revoke execute on function remove_sample_data() from public, anon;
grant execute on function remove_sample_data() to authenticated;
