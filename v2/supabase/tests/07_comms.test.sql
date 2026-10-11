begin;
select plan(39);

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

\set alpha 0000000a-0000-0000-0000-000000000001
\set beta 0000000b-0000-0000-0000-000000000001
\set gamma 0000000c-0000-0000-0000-000000000001
\set tpl 0000000a-0000-0000-0000-00000000a0f1
\set msg 0000000a-0000-0000-0000-00000000b0f1
\set msg2 0000000a-0000-0000-0000-00000000b0f2
\set n1 0000000a-0000-0000-0000-00000000c0f1
\set n2 0000000a-0000-0000-0000-00000000c0f2
\set admin 00000000-0000-0000-0000-0000000000a2
\set member 00000000-0000-0000-0000-0000000000a3
\set betaowner 00000000-0000-0000-0000-0000000000b1

-- Every org has the five system templates, and a new org gets them too
select results_eq(format($$ select kind from message_templates where org_id = %L and is_system order by kind $$, :'alpha'),
  $$ values ('invite'::text), ('record_approved'), ('record_rejected'), ('task_assigned'), ('task_overdue') $$, 'alpha has the five system templates');
select is((select count(*)::int from message_templates where org_id = :'beta' and is_system), 5, 'beta has its own five');
select pg_temp.act_as(:'member');
select lives_ok(format($$ select create_org('Gamma Club', %L) $$, :'gamma'), 'a member creates an org');
select is((select count(*)::int from message_templates where org_id = :'gamma'), 5, 'a new org gets the system templates');
select throws_ok(format($$ select seed_message_templates(%L) $$, :'alpha'), '42501', null, 'clients cannot call the seeder');

-- Templates: every member reads them; only comms.manage writes; system templates keep their type and stay
select is((select count(*)::int from message_templates where org_id = :'alpha'), 5, 'a member reads the org templates');
select is_empty(format($$ update message_templates set subject = 'x' where org_id = %L returning id $$, :'alpha'), 'a member cannot edit templates');
select throws_ok(format($$ insert into message_templates (org_id, name, subject, body) values (%L, 'Mine', 's', 'b') $$, :'alpha'),
  '42501', null, 'a member cannot create templates');
select pg_temp.act_as(:'admin');
select isnt_empty(format($$ update message_templates set body = 'Hi {{recipient.name}}' where org_id = %L and kind = 'task_assigned' returning id $$, :'alpha'),
  'comms.manage edits a system template');
select isnt_empty(format($$ select 1 from audit_log where action = 'template.update' and org_id = %L $$, :'alpha'), 'template edit audited');
select throws_ok(format($$ update message_templates set kind = 'custom' where org_id = %L and kind = 'invite' $$, :'alpha'),
  'P0001', 'A template cannot change its type.', 'a system template keeps its kind');
select is_empty(format($$ delete from message_templates where org_id = %L and is_system returning id $$, :'alpha'), 'system templates cannot be deleted');
select throws_ok(format($$ insert into message_templates (org_id, name, subject, body, is_system, kind) values (%L, 'Fake', 's', 'b', true, 'task_assigned') $$, :'alpha'),
  '42501', null, 'clients cannot create system templates');
select lives_ok(format($$ insert into message_templates (id, org_id, name, subject, body) values (%L, %L, 'Trip reminder', 'Trip', 'Bring {{record.data.item}}') $$, :'tpl', :'alpha'),
  'comms.manage creates a custom template');
select isnt_empty(format($$ delete from message_templates where id = %L returning id $$, :'tpl'), 'comms.manage deletes a custom template');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from message_templates where org_id = :'alpha'), 0, 'beta reads no alpha templates');
select is_empty(format($$ update message_templates set subject = 'x' where org_id = %L returning id $$, :'alpha'), 'beta cannot edit alpha templates');

-- Messages: comms.manage reads the queue of its own org; retry only failed rows; clients never queue
reset role;
insert into messages (id, org_id, recipient_email, subject, body_html, body_text, status, attempts, error)
values (:'msg', :'alpha', 'a@example.com', 'Hello', '<p>Hi</p>', 'Hi', 'failed', 4, 'The email service refused this message: invalid address');
insert into messages (id, org_id, recipient_email, subject, body_html, body_text)
values (:'msg2', :'alpha', 'b@example.com', 'Hello', '<p>Hi</p>', 'Hi');
select pg_temp.act_as(:'member');
select is((select count(*)::int from messages), 0, 'a member reads no messages');
select throws_ok(format($$ select retry_message(%L) $$, :'msg'), '42501', null, 'a member cannot retry');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from messages), 0, 'beta reads no alpha messages');
select throws_ok(format($$ select retry_message(%L) $$, :'msg'), '42501', null, 'beta cannot retry an alpha message');
select pg_temp.act_as(:'admin');
select is((select count(*)::int from messages where org_id = :'alpha'), 2, 'comms.manage reads the queue');
select throws_ok(format($$ select retry_message(%L) $$, :'msg2'), 'P0001', 'Only failed messages can be retried.', 'a queued message cannot be retried');
select lives_ok(format($$ select retry_message(%L) $$, :'msg'), 'comms.manage retries a failed message');
select results_eq(format($$ select status, attempts, error from messages where id = %L $$, :'msg'),
  $$ values ('queued'::text, 0, null::text) $$, 'retry requeues with a fresh attempt count');
select isnt_empty(format($$ select 1 from audit_log where action = 'message.retry' and target = %L $$, :'msg'), 'retry audited');
select throws_ok(format($$ insert into messages (org_id, recipient_email, subject, body_html, body_text) values (%L, 'x@example.com', 's', 'b', 'b') $$, :'alpha'),
  '42501', null, 'clients cannot queue messages');

-- Notifications: own rows only, links stay inside the app, only read_at is writable
reset role;
insert into notifications (id, user_id, org_id, kind, title, link) values
  (:'n1', :'member', :'alpha', 'task_assigned', 'For member', '#/inbox'),
  (:'n2', :'admin', :'alpha', 'task_assigned', 'For admin', '#/inbox');
select throws_ok(format($$ insert into notifications (user_id, org_id, kind, title, link) values (%L, %L, 'custom', 'x', 'https://evil.example') $$, :'member', :'alpha'),
  '23514', null, 'a notification link stays inside the app');
select pg_temp.act_as(:'member');
select results_eq($$ select title from notifications $$, $$ values ('For member'::text) $$, 'a user reads only their own notifications');
select isnt_empty(format($$ update notifications set read_at = now() where id = %L returning id $$, :'n1'), 'a user marks their own notification read');
select is_empty(format($$ update notifications set read_at = now() where id = %L returning id $$, :'n2'), 'a user cannot touch another user''s notification');
select throws_ok(format($$ update notifications set title = 'x' where id = %L $$, :'n1'), '42501', null, 'only read_at is writable');
select pg_temp.act_as(:'betaowner');
select is((select count(*)::int from notifications), 0, 'beta reads no alpha notifications');

-- Preferences: private, own rows only, invites cannot be muted
select pg_temp.act_as(:'member');
select lives_ok($$ insert into notification_prefs (type, email_enabled) values ('task_overdue', false) $$, 'a user mutes an email type');
select throws_ok(format($$ insert into notification_prefs (user_id, type, email_enabled) values (%L, 'task_overdue', false) $$, :'admin'),
  '42501', null, 'a user cannot set someone else''s preferences');
select throws_ok($$ insert into notification_prefs (type, email_enabled) values ('invite', false) $$, '23514', null, 'invites cannot be muted');
select pg_temp.act_as(:'admin');
select is((select count(*)::int from notification_prefs), 0, 'preferences are private');

-- Realtime and the worker's cron job
reset role;
select isnt_empty($$ select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications' $$,
  'notifications are published to Realtime');
select isnt_empty($$ select 1 from cron.job where jobname = 'send-messages' $$, 'the send-messages cron job exists');

select * from finish();
rollback;
