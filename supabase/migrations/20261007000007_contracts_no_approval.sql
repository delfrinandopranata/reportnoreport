-- Contract Manager is a plain list: a firm's clients' contracts with their own clients (the counterparty). No review workflow.

alter table contracts add column counterparty text not null default '';

drop function approve_contract(uuid, boolean);
-- Dropping status also drops contracts_reminder_idx.
alter table contracts drop column status, drop column reviewed_by, drop column reviewed_at;
create index contracts_reminder_idx on contracts (end_date) where reminder_sent_at is null;

-- Without approval, people need to correct and remove records; same gate as insert.
create policy contracts_update on contracts for update
  using (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id))
  with check (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id));
create policy contracts_delete on contracts for delete
  using (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id));

-- A moved end date deserves a fresh reminder.
create or replace function reset_contract_reminder() returns trigger language plpgsql as $$
begin
  if new.end_date is distinct from old.end_date then new.reminder_sent_at := null; end if;
  return new;
end $$;
create trigger reset_reminder before update on contracts for each row execute function reset_contract_reminder();
