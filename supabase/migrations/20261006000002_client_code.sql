-- Firms' own pre-existing client numbering/reference, free text. Not a replacement
-- for the UUID primary key; deliberately not unique — legacy IDs are often messy.
alter table clients add column client_code text not null default '';
create index clients_firm_code_idx on clients (firm_id, client_code) where client_code <> '';
