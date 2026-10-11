begin;
select plan(7);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set rep 0000000a-0000-0000-0000-00000000e001
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3

reset role;
delete from dashboard_widgets where org_id = :'alpha';
insert into dashboard_widgets (id, org_id, report_id, kind, title, span, position) values
  ('0000000a-0000-0000-0000-00000000f001', :'alpha', :'rep', 'number', 'A', 1, 1),
  ('0000000a-0000-0000-0000-00000000f002', :'alpha', :'rep', 'number', 'B', 1, 2);

select pg_temp.act_as(:'member');
select isnt((select version from dashboard_versions where org_id = :'alpha'), null, 'reports.view reads the dashboard version');

select pg_temp.act_as(:'admin');
create temp table v0 as select version from dashboard_versions where org_id = :'alpha';
grant all on v0 to authenticated;
select lives_ok(format($$ select save_dashboard_layout(%L, %L::jsonb, %s) $$, :'alpha',
  '[{"id":"0000000a-0000-0000-0000-00000000f002","span":1},{"id":"0000000a-0000-0000-0000-00000000f001","span":1}]', (select version from v0)), 'a clean save at the loaded version');
select is((select version from dashboard_versions where org_id = :'alpha'), (select version + 1 from v0), 'every save bumps the version');
select throws_ok(format($$ select save_dashboard_layout(%L, %L::jsonb, %s) $$, :'alpha',
  '[{"id":"0000000a-0000-0000-0000-00000000f001","span":1},{"id":"0000000a-0000-0000-0000-00000000f002","span":1}]', (select version from v0)),
  'P0001', 'The dashboard changed. Reload to see the latest layout.', 'a reorder made in another tab is a conflict');
select throws_ok(format($$ select save_dashboard_layout(%L, %L::jsonb, %s) $$, :'alpha',
  '[{"id":"0000000a-0000-0000-0000-00000000f002","span":4},{"id":"0000000a-0000-0000-0000-00000000f001","span":1}]', (select version from v0)),
  'P0001', 'The dashboard changed. Reload to see the latest layout.', 'a resize made in another tab is a conflict');

create temp table v1 as select version from dashboard_versions where org_id = :'alpha';
grant all on v1 to authenticated;
insert into dashboard_widgets (org_id, report_id, kind, title, span, position) values (:'alpha', :'rep', 'number', 'C', 1, 3);
select isnt((select version from dashboard_versions where org_id = :'alpha'), (select version from v1), 'adding a widget bumps the version');
select throws_ok(format($$ select save_dashboard_layout(%L, %L::jsonb, %s) $$, :'alpha',
  '[{"id":"0000000a-0000-0000-0000-00000000f002","span":1},{"id":"0000000a-0000-0000-0000-00000000f001","span":1}]', (select version from v1)),
  'P0001', 'The dashboard changed. Reload to see the latest layout.', 'an add made in another tab is a conflict');

select * from finish();
rollback;
