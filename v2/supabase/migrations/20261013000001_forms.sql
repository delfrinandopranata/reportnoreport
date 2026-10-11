create table forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  schema jsonb not null default '[]' check (jsonb_typeof(schema) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index forms_org_idx on forms (org_id);

-- Standalone until Phase 3 renames it to `submissions` and adds record_id / node_id / outcome.
create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  form_id uuid not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  submitted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (form_id, org_id) references forms (id, org_id) on delete restrict
);
create index form_submissions_form_idx on form_submissions (form_id, created_at desc);

alter table forms enable row level security;
alter table form_submissions enable row level security;

create policy forms_read on forms for select using (is_member(org_id));
create policy forms_insert on forms for insert with check (has_permission(org_id, 'forms.manage'));
create policy forms_update on forms for update
  using (has_permission(org_id, 'forms.manage')) with check (has_permission(org_id, 'forms.manage'));
create policy forms_delete on forms for delete using (has_permission(org_id, 'forms.manage'));

create policy form_submissions_read on form_submissions for select
  using ((submitted_by = auth.uid() and is_member(org_id)) or has_permission(org_id, 'forms.manage'));
-- No insert/update/delete policies: submit-form (service role) is the only writer, after validating.

create or replace function forms_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    if new.org_id is distinct from old.org_id then raise exception 'Not allowed' using errcode = '42501'; end if;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger forms_before_write before insert or update on forms for each row execute function forms_before_write();

create or replace function audit_forms() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit(new.org_id, 'form.create', new.id::text, null, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    perform audit(new.org_id, 'form.update', new.id::text,
      jsonb_build_object('name', old.name, 'fields', jsonb_array_length(old.schema)),
      jsonb_build_object('name', new.name, 'fields', jsonb_array_length(new.schema)));
  else
    perform audit(old.org_id, 'form.delete', old.id::text, jsonb_build_object('name', old.name), null);
  end if;
  return null;
end $$;
revoke execute on function audit_forms() from public, anon, authenticated;
create trigger forms_audit after insert or update or delete on forms for each row execute function audit_forms();

-- Files and signatures: <org_id>/<user_id>/<uuid>-<name>, private.
insert into storage.buckets (id, name, public, file_size_limit)
values ('form-files', 'form-files', false, 10485760)
on conflict (id) do nothing;

-- Plain SQL (not security definer): parses the org folder, null when the path is not ours.
create or replace function storage_path_org(p_name text) returns uuid language sql immutable as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_name, '/', 1)::uuid end
$$;

create policy form_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'form-files'
    and split_part(name, '/', 2) = auth.uid()::text
    and public.is_member(public.storage_path_org(name)));
create policy form_files_read on storage.objects for select to authenticated
  using (bucket_id = 'form-files' and (
    (split_part(name, '/', 2) = auth.uid()::text and public.is_member(public.storage_path_org(name)))
    or public.has_permission(public.storage_path_org(name), 'forms.manage')));
-- No update/delete policies: an uploaded file is never overwritten.
