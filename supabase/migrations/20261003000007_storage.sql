insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 204800, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do nothing;

create policy logos_read on storage.objects for select
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text);
create policy logos_write on storage.objects for insert
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage'));
create policy logos_update on storage.objects for update
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage'));
create policy logos_delete on storage.objects for delete
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth_firm_id()::text and auth_can('settings.manage'));
