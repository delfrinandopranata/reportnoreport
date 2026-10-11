begin;
select plan(42);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set wf 0000000a-0000-0000-0000-00000000c001
\set camp 0000000a-0000-0000-0000-00000000f601
\set camp2 0000000a-0000-0000-0000-00000000f602
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3
\set viewer 00000000-0000-0000-0000-0000000000a4
\set betaowner 00000000-0000-0000-0000-0000000000b1

-- Drafts: comms.broadcast creates and edits; nobody writes status or results directly
select pg_temp.act_as(:'member');
select throws_ok(format($$ insert into campaigns (org_id, name) values (%L, 'x') $$, :'alpha'), '42501', null, 'a member cannot create a campaign');
select pg_temp.act_as(:'admin');
select lives_ok(format($$ insert into campaigns (id, org_id, name, template_id, audience) values (%L, %L, 'Term starts',
  (select id from message_templates where org_id = %L and kind = 'record_approved'),
  jsonb_build_object('kind', 'role', 'roleId', (select id from roles where org_id = %L and name = 'Member'))) $$,
  :'camp', :'alpha', :'alpha', :'alpha'), 'comms.broadcast creates a draft');
select isnt_empty(format($$ select 1 from audit_log where action = 'campaign.create' and target = %L $$, :'camp'), 'create audited');
select throws_ok(format($$ update campaigns set status = 'sent' where id = %L $$, :'camp'), '42501', null, 'status cannot be written directly');
select lives_ok(format($$ insert into campaigns (id, org_id, name) values (%L, %L, 'No template yet') $$, :'camp2', :'alpha'), 'a second draft without a template');
select lives_ok(format($$ update campaigns set linked_workflow_id = %L where id = %L $$, :'wf', :'camp'), 'records.view_all links a workflow');

-- Linking needs records.view_all for that workflow
reset role;
insert into workflow_access (workflow_id, org_id, role_id, can_start, can_view_all)
values (:'wf', :'alpha', (select id from roles where org_id = :'alpha' and name = 'Admin'), true, false)
on conflict (workflow_id, role_id) do update set can_view_all = false;
select pg_temp.act_as(:'admin');
update campaigns set linked_workflow_id = null where id = :'camp';
select throws_ok(format($$ update campaigns set linked_workflow_id = %L where id = %L $$, :'wf', :'camp'),
  'P0001', 'You can only link a workflow whose records you can all see.', 'linking needs records.view_all for that workflow');
reset role;
update workflow_access set can_view_all = true where workflow_id = :'wf' and role_id = (select id from roles where org_id = :'alpha' and name = 'Admin');
select pg_temp.act_as(:'admin');
update campaigns set linked_workflow_id = :'wf' where id = :'camp';

select pg_temp.act_as(:'member');
select is((select count(*)::int from campaigns), 0, 'a member reads no campaigns');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from campaigns where org_id = :'alpha'), 0, 'beta reads no alpha campaigns');
select is_empty(format($$ update campaigns set name = 'x' where id = %L returning id $$, :'camp'), 'beta cannot edit an alpha campaign');

-- Scheduling and cancelling
select pg_temp.act_as(:'member');
select throws_ok(format($$ select schedule_campaign(%L) $$, :'camp'), '42501', null, 'a member cannot schedule');
select pg_temp.act_as(:'admin');
select throws_ok(format($$ select schedule_campaign(%L, now() - interval '1 hour') $$, :'camp'), 'P0001', 'Choose a time in the future.', 'a past time is refused');
select throws_ok(format($$ select schedule_campaign(%L) $$, :'camp2'), 'P0001', 'Choose a message template before sending.', 'no template, no schedule');
select lives_ok(format($$ select schedule_campaign(%L, now() + interval '1 hour') $$, :'camp'), 'comms.broadcast schedules a draft');
select results_eq(format($$ select status, sent_by from campaigns where id = %L $$, :'camp'),
  format($$ values ('scheduled'::text, %L::uuid) $$, :'admin'), 'scheduled, with the scheduler as sender');
select isnt_empty(format($$ select 1 from audit_log where action = 'campaign.schedule' and target = %L $$, :'camp'), 'schedule audited');
select is_empty(format($$ update campaigns set name = 'x' where id = %L returning id $$, :'camp'), 'a scheduled campaign cannot be edited');
select is_empty(format($$ delete from campaigns where id = %L returning id $$, :'camp'), 'a scheduled campaign cannot be deleted');
select throws_ok(format($$ select schedule_campaign(%L) $$, :'camp'), 'P0001', 'Only a draft campaign can be scheduled.', 'scheduling twice is refused');
select lives_ok(format($$ select cancel_campaign(%L) $$, :'camp'), 'cancelling returns it to draft');
select is((select status from campaigns where id = :'camp'), 'draft', 'back to draft');

-- A sent campaign with tracked messages, read by a broadcaster who does not manage messages
reset role;
insert into roles (id, org_id, name) values ('0000000a-0000-0000-0000-00000000f6f0', :'alpha', 'Broadcaster');
insert into role_permissions values ('0000000a-0000-0000-0000-00000000f6f0', 'comms.broadcast');
insert into member_roles select id, '0000000a-0000-0000-0000-00000000f6f0' from members where org_id = :'alpha' and user_id = :'viewer';
update campaigns set status = 'sent', scheduled_at = now() - interval '2 days', audience_snapshot_at = now() - interval '2 days', channel = 'email', recipients = 4
where id = :'camp';
insert into messages (org_id, campaign_id, recipient_user_id, recipient_email, subject, body_html, body_text, status, error, sent_at, delivered_at, opened_at, clicked_at, bounced_at) values
  (:'alpha', :'camp', :'member', 'member@alpha.test', 'Hi', '<p>Hi</p>', 'Hi', 'sent', null, now() - interval '2 days', now() - interval '2 days',
   now() - interval '2 days' + interval '1 hour', now() - interval '1 day' + interval '1 hour', null),
  (:'alpha', :'camp', :'admin', 'admin@alpha.test', 'Hi', '<p>Hi</p>', 'Hi', 'sent', null, now() - interval '2 days', now() - interval '2 days', null, null, null),
  (:'alpha', :'camp', null, 'bounce@example.test', 'Hi', '<p>Hi</p>', 'Hi', 'sent', null, now() - interval '2 days', null, null, null, now() - interval '2 days'),
  (:'alpha', :'camp', null, 'fail@example.test', 'Hi', '<p>Hi</p>', 'Hi', 'failed', 'The email service refused this message: HTTP 422', null, null, null, null, null),
  (:'alpha', null, :'member', 'member@alpha.test', 'Task', '<p>Task</p>', 'Task', 'sent', null, now(), null, null, null, null);
insert into records (org_id, workflow_id, title, current_node_id, status, started_by, created_at)
values (:'alpha', :'wf', 'Campaign completion test', null, 'done', :'member', now() - interval '1 day');

select pg_temp.act_as(:'member');
select is((select count(*)::int from messages where campaign_id = :'camp'), 0, 'a member reads no campaign messages');
select pg_temp.act_as(:'viewer');
select is((select count(*)::int from messages where campaign_id = :'camp'), 4, 'comms.broadcast reads campaign messages');
select is((select count(*)::int from messages where campaign_id is null), 0, 'but not workflow messages');
select results_eq(format($$ select recipients, queued, sent, failed, delivered, opened, clicked, bounced, complained from campaign_stats(%L) where campaign_id = %L $$, :'alpha', :'camp'),
  $$ values (4, 0, 3, 1, 2, 1, 1, 1, 0) $$, 'stats count every message');
select results_eq(format($$ select day, opens, clicks from campaign_daily(%L) $$, :'camp'),
  $$ values (0, 1, 0), (1, 0, 1), (2, 0, 0), (3, 0, 0), (4, 0, 0), (5, 0, 0), (6, 0, 0) $$, 'first opens and clicks per day for seven days');
select throws_ok(format($$ select * from campaign_completion(%L) $$, :'camp'), '42501', null, 'completion needs records.view_all for the workflow');
select pg_temp.act_as(:'member');
select is_empty(format($$ select 1 from campaign_stats(%L) $$, :'alpha'), 'a member gets no stats');
select pg_temp.act_as(:'admin');
select results_eq(format($$ select people, started, finished from campaign_completion(%L) $$, :'camp'),
  $$ values (2, 1, 1) $$, 'completion counts members who started and finished after the send');

-- In-app: reading the notice marks the message opened
reset role;
insert into messages (org_id, campaign_id, recipient_user_id, recipient_email, channel, subject, body_html, body_text, status, sent_at)
values (:'alpha', :'camp2', :'member', 'member@alpha.test', 'in_app', 'Hello', '<p>Hello</p>', 'Hello', 'sent', now());
insert into notifications (org_id, user_id, campaign_id, kind, title, body, link) values (:'alpha', :'member', :'camp2', 'campaign', 'Hello', 'Hello', '#/inbox');
select pg_temp.act_as(:'member');
update notifications set read_at = now() where campaign_id = :'camp2';
reset role;
select isnt((select opened_at from messages where campaign_id = :'camp2'), null, 'reading an in-app campaign notice marks it opened');

-- Opt-outs: a member manages only their own address; broadcasters read their org's list
select pg_temp.act_as(:'member');
select lives_ok(format($$ insert into email_optouts (org_id, email, reason) values (%L, 'member@alpha.test', 'settings') $$, :'alpha'), 'a member opts out their own address');
select throws_ok(format($$ insert into email_optouts (org_id, email, reason) values (%L, 'admin@alpha.test', 'settings') $$, :'alpha'), '42501', null, 'not someone else''s');
select throws_ok(format($$ insert into email_optouts (org_id, email, reason) values (%L, 'member@alpha.test', 'complaint') $$, :'alpha'), '42501', null, 'and not as a complaint');
select is((select count(*)::int from email_optouts), 1, 'a member reads their own opt-out');
select pg_temp.act_as(:'viewer');
select is((select count(*)::int from email_optouts where org_id = :'alpha'), 1, 'a broadcaster reads the org''s opt-outs');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from email_optouts where org_id = :'alpha'), 0, 'beta reads no alpha opt-outs');
select pg_temp.act_as(:'member');
select isnt_empty(format($$ delete from email_optouts where org_id = %L returning email $$, :'alpha'), 'a member opts back in');

-- Guards
reset role;
select throws_ok(format($$ insert into messages (org_id, campaign_id, recipient_email, subject, body_html, body_text)
  values (%L, %L, 'MEMBER@alpha.test', 'Hi', 'x', 'x') $$, :'alpha', :'camp'), '23505', null, 'one message per address per campaign');
select isnt_empty($$ select 1 from cron.job where jobname = 'send-campaigns' $$, 'the send-campaigns cron job exists');
select pg_temp.act_as(:'admin');
select throws_ok($$ select wake_send_campaigns() $$, '42501', null, 'clients cannot wake the worker');
select isnt_empty(format($$ delete from campaigns where id = %L returning id $$, :'camp2'), 'a draft can be deleted');
select is_empty(format($$ delete from campaigns where id = %L returning id $$, :'camp'), 'a sent campaign cannot be deleted');

select * from finish();
rollback;
