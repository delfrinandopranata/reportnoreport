begin;
select plan(6);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set camp 0000000a-0000-0000-0000-00000000f611
\set admin 00000000-0000-0000-0000-0000000000a2

select pg_temp.act_as(:'admin');
insert into campaigns (id, org_id, name, template_id, audience) values (:'camp', :'alpha', 'Retry me',
  (select id from message_templates where org_id = :'alpha' and kind = 'record_approved'),
  jsonb_build_object('kind', 'role', 'roleId', (select id from roles where org_id = :'alpha' and name = 'Member')));
select results_eq(format($$ select attempts, claimed_until is null from campaigns where id = %L $$, :'camp'), $$ values (0, true) $$, 'a new campaign has no attempts');
select throws_ok(format($$ update campaigns set attempts = 9 where id = %L $$, :'camp'), '42501', null, 'clients cannot write attempts');
select lives_ok(format($$ select schedule_campaign(%L, now() + interval '1 hour') $$, :'camp'), 'schedules');

-- a killed run spent attempts and left a lease; cancelling and scheduling again starts afresh
reset role;
update campaigns set attempts = 3, claimed_until = now() + interval '3 minutes' where id = :'camp';
select pg_temp.act_as(:'admin');
select lives_ok(format($$ select cancel_campaign(%L) $$, :'camp'), 'cancels');
select lives_ok(format($$ select schedule_campaign(%L, now() + interval '1 hour') $$, :'camp'), 'schedules again');
select results_eq(format($$ select attempts, claimed_until is null from campaigns where id = %L $$, :'camp'), $$ values (0, true) $$, 'scheduling again resets the attempts and the lease');
select * from finish();
rollback;
