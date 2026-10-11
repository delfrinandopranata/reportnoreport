begin;
select plan(8);

\set alpha 0000000a-0000-0000-0000-000000000001
\set wf 0000000a-0000-0000-0000-00000000c001

reset role;
select lives_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns, filters, group_by, aggregate) values (%L, %L, 'ok',
  '[{"meta":"title"},{"field":"days"}]', '[{"field":"days","operator":"gt","value":2}]', '{"field":"leave_type"}', '{"fn":"sum","field":"days"}') $$, :'alpha', :'wf'), 'a normal report is accepted');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns) select %L, %L, 'x', jsonb_agg(jsonb_build_object('meta', 'title')) from generate_series(1, 21) $$, :'alpha', :'wf'),
  '23514', null, '21 columns are refused');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns) select %L, %L, 'x', jsonb_agg(jsonb_build_object('meta', 'title')) from generate_series(1, 20000) $$, :'alpha', :'wf'),
  '23514', null, '20,000 columns are refused');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns, filters) select %L, %L, 'x', '[{"meta":"title"}]', jsonb_agg(jsonb_build_object('field', 'a', 'operator', 'is')) from generate_series(1, 11) $$, :'alpha', :'wf'),
  '23514', null, '11 filters are refused');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns) values (%L, %L, 'x', '[{"meta":"title","payload":"x"}]') $$, :'alpha', :'wf'),
  '23514', null, 'an unknown column key is refused');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns, filters) values (%L, %L, 'x', '[{"meta":"title"}]', '[{"field":"a","operator":"is","extra":1}]') $$, :'alpha', :'wf'),
  '23514', null, 'an unknown filter key is refused');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns, group_by, aggregate) values (%L, %L, 'x', '[{"meta":"title"}]', '{"field":"a","x":1}', '{"fn":"count"}') $$, :'alpha', :'wf'),
  '23514', null, 'an unknown group-by key is refused');
select throws_ok(format($$ insert into saved_reports (org_id, workflow_id, name, columns, filters) values (%L, %L, 'x', '[{"meta":"title"}]', jsonb_build_array(jsonb_build_object('field','a','operator','is','value', repeat('x', 30000)))) $$, :'alpha', :'wf'),
  '23514', null, 'an oversized definition is refused');

select * from finish();
rollback;
