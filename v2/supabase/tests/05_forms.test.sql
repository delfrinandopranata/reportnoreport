begin;
select plan(23);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set f1 0000000a-0000-0000-0000-0000000000f1
\set f2 0000000a-0000-0000-0000-0000000000f2

-- Admin (holds forms.manage) creates and renames a form; created_by is forced; both audited
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(format($$ insert into forms (id, org_id, name, schema, created_by) values (%L, %L, 'Trip consent', '[]', '00000000-0000-0000-0000-0000000000a1') $$, :'f2', :'alpha'), 'admin creates a form');
select is((select created_by::text from forms where id = :'f2'), '00000000-0000-0000-0000-0000000000a2', 'created_by is the caller, not the client value');
select isnt_empty(format($$ select 1 from audit_log where action = 'form.create' and target = %L $$, :'f2'), 'form create audited');
select lives_ok(format($$ update forms set name = 'Trip consent 2027' where id = %L $$, :'f2'), 'admin renames a form');
select isnt_empty(format($$ select 1 from audit_log where action = 'form.update' and target = %L and after->>'name' = 'Trip consent 2027' $$, :'f2'), 'form update audited');

-- Member reads but cannot write
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select results_eq(format($$ select count(*)::int from forms where org_id = %L $$, :'alpha'), array[2], 'member reads the org forms');
select throws_ok(format($$ insert into forms (org_id, name) values (%L, 'Nope') $$, :'alpha'), '42501', null, 'member cannot create forms');
select is_empty(format($$ update forms set name = 'Hacked' where id = %L returning id $$, :'f1'), 'member cannot edit forms');
select is_empty(format($$ delete from forms where id = %L returning id $$, :'f1'), 'member cannot delete forms');
select throws_ok(format($$ insert into form_submissions (org_id, form_id, answers, submitted_by) values (%L, %L, '{}', auth.uid()) $$, :'alpha', :'f1'),
  '42501', null, 'clients cannot insert submissions');

-- Another org sees and writes nothing
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is_empty(format($$ select 1 from forms where org_id = %L $$, :'alpha'), 'beta owner cannot read alpha forms');
select throws_ok(format($$ insert into forms (org_id, name) values (%L, 'Sneaky') $$, :'alpha'), '42501', null, 'beta owner cannot create alpha forms');

-- Submission visibility (row written as the service role would)
reset role;
insert into form_submissions (org_id, form_id, answers, submitted_by)
values (:'alpha', :'f1', '{"name":"Ada"}', '00000000-0000-0000-0000-0000000000a3');
select throws_ok(format($$ insert into form_submissions (org_id, form_id, answers, submitted_by) values (%L, %L, '{}', '00000000-0000-0000-0000-0000000000b1') $$, :'beta', :'f1'),
  '23503', null, 'a submission must belong to its form''s org');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is_empty($$ select 1 from form_submissions $$, 'viewer cannot read other people''s submissions');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select isnt_empty($$ select 1 from form_submissions $$, 'submitter reads own submission');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select isnt_empty($$ select 1 from form_submissions $$, 'forms.manage reads every submission');
select throws_ok(format($$ delete from forms where id = %L $$, :'f1'), '23503', null, 'a form with submissions cannot be deleted');
select throws_ok(format($$ update forms set org_id = %L where id = %L $$, :'beta', :'f2'), '42501', null, 'a form cannot move to another org');

-- Storage: own folder only, org-scoped reads
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('form-files', %L) $$, :'alpha' || '/00000000-0000-0000-0000-0000000000a3/mc.pdf'),
  'member uploads into their own folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('form-files', %L) $$, :'alpha' || '/00000000-0000-0000-0000-0000000000a2/x.pdf'),
  '42501', null, 'cannot upload into another user''s folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('form-files', %L) $$, :'beta' || '/00000000-0000-0000-0000-0000000000a3/x.pdf'),
  '42501', null, 'cannot upload into an org you do not belong to');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
select is_empty($$ select 1 from storage.objects where bucket_id = 'form-files' $$, 'viewer cannot read another member''s files');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select isnt_empty($$ select 1 from storage.objects where bucket_id = 'form-files' $$, 'forms.manage reads the org files');

select * from finish();
rollback;
