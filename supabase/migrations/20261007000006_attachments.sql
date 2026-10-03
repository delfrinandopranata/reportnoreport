-- Attachments: a file attached to a transaction or a client. Compressed client-side before
-- upload (images only; PDFs are stored as-is). Read/insert/delete follow the clients.edit
-- permission, same as contracts; there is no update — an attachment is replaced by deleting
-- and re-uploading, not edited in place.

create table attachments (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade default auth_firm_id(),
  transaction_id uuid references transactions(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_by uuid not null references profiles(id) default auth_profile_id(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(transaction_id, client_id) = 1)
);
create index attachments_firm_idx on attachments (firm_id);
create index attachments_transaction_idx on attachments (transaction_id);
create index attachments_client_idx on attachments (client_id);

alter table attachments enable row level security;

create trigger log after insert or update or delete on attachments for each row execute function log_change();

create policy attachments_read on attachments for select using (firm_id = auth_firm_id());
create policy attachments_insert on attachments for insert
  with check (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id));
create policy attachments_delete on attachments for delete
  using (firm_id = auth_firm_id() and auth_can('clients.edit') and firm_can_write(firm_id));

-- Same-firm referencing, mirroring check_same_firm()/check_contract_same_firm(): without this,
-- a firm could attach a file to another firm's transaction or client via a crafted insert.
create or replace function check_attachment_same_firm() returns trigger language plpgsql as $$
begin
  if new.transaction_id is not null and not exists (select 1 from transactions where id = new.transaction_id and firm_id = new.firm_id) then
    raise exception 'Transaction must belong to the same firm as the attachment.' using errcode = 'P0001';
  end if;
  if new.client_id is not null and not exists (select 1 from clients where id = new.client_id and firm_id = new.firm_id) then
    raise exception 'Client must belong to the same firm as the attachment.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger same_firm before insert or update on attachments for each row execute function check_attachment_same_firm();

-- Storage bucket, modelled on the `logos` bucket: firm-folder-scoped, 10MB cap, images + PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy attachments_storage_read on storage.objects for select
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth_firm_id()::text);
create policy attachments_storage_write on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('clients.edit') and firm_can_write(auth_firm_id()));
create policy attachments_storage_delete on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('clients.edit') and firm_can_write(auth_firm_id()));
