-- Security fix: contracts_insert only checked firm_id = auth_firm_id(), never that client_id
-- belongs to that same firm (unlike transactions, which has this check via check_same_firm()).
-- A firm could insert a contract pointing at another firm's client_id; the contract-reminders
-- Edge Function (service role, bypasses RLS) would then join that client's name into a reminder
-- email sent to the attacking firm's own owner/admin, leaking the victim's client name.

create or replace function check_contract_same_firm() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from clients where id = new.client_id and firm_id = new.firm_id) then
    raise exception 'Client must belong to the same firm as the contract.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger same_firm before insert or update on contracts for each row execute function check_contract_same_firm();
