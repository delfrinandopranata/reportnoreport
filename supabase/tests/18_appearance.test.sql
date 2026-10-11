begin;
select plan(11);

-- Fixtures as superuser: three profiles in alpha, one with a theme pref, plus one in a firm per design system.
update firms set design_system = 'forest' where id = '0000000a-0000-0000-0000-000000000001';
update firms set design_system = 'ocean' where name like 'Beta%';
delete from user_preferences where key in ('theme', 'appearance');
insert into user_preferences (profile_id, key, value) values
  ((select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a1'), 'theme', '"dark"'),
  ((select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a2'), 'theme', '"bogus"');

-- Mapping under test is the migration body; re-run it via a function so it can run twice.
create or replace function pg_temp.run_backfill() returns void language sql as $$
  insert into user_preferences (profile_id, key, value)
  select p.id, 'appearance', jsonb_build_object(
    'theme', coalesce((select t.value #>> '{}' from user_preferences t
                       where t.profile_id = p.id and t.key = 'theme' and t.value #>> '{}' in ('light', 'dark', 'system')), 'system'),
    'accent', case f.design_system when 'ocean' then 'ocean' when 'forest' then 'fern' when 'sunset' then 'saffron' else 'midnight' end,
    'density', 'comfortable')
  from profiles p left join firms f on f.id = p.firm_id
  on conflict (profile_id, key) do nothing $$;
select pg_temp.run_backfill();

select is((select value from user_preferences where profile_id = (select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a1') and key = 'appearance'),
  '{"theme":"dark","accent":"fern","density":"comfortable"}'::jsonb, 'dark theme + forest firm -> dark/fern');
select is((select value->>'theme' from user_preferences where profile_id = (select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a2') and key = 'appearance'),
  'system', 'unrecognised theme -> system');
select is((select value->>'theme' from user_preferences where profile_id = (select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a3') and key = 'appearance'),
  'system', 'no theme -> system');
select is((select count(*)::int from profiles p where not exists
  (select 1 from user_preferences u where u.profile_id = p.id and u.key = 'appearance')), 0, 'every profile has an appearance');
select is_empty($$ select 1 from user_preferences where key = 'appearance'
  and (value->>'theme' not in ('light','dark','system')
    or value->>'accent' not in ('midnight','ocean','bw','graphite','fern','rosewood','iris','saffron')) $$,
  'mapping is total: only valid theme and accent values');

select is((select value->>'accent' from user_preferences u join profiles p on p.id = u.profile_id where p.email = 'owner@beta.test' and u.key = 'appearance'),
  'ocean', 'ocean firm -> ocean');
delete from user_preferences where key = 'appearance' and profile_id in (select id from profiles where email = 'owner@beta.test');
update firms set design_system = 'sunset' where name like 'Beta%';
select pg_temp.run_backfill();
select is((select value->>'accent' from user_preferences u join profiles p on p.id = u.profile_id where p.email = 'owner@beta.test' and u.key = 'appearance'),
  'saffron', 'sunset firm -> saffron');

-- Idempotent: a user's later choice survives a re-run.
update user_preferences set value = '{"theme":"light","accent":"iris","density":"compact"}'
  where profile_id = (select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a1') and key = 'appearance';
select pg_temp.run_backfill();
select is((select value->>'accent' from user_preferences where profile_id = (select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a1') and key = 'appearance'),
  'iris', 're-run does not overwrite');
select is((select count(*)::int from user_preferences where key = 'appearance'), (select count(*)::int from profiles), 're-run adds no duplicates');

-- RLS: a person sees only their own.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from user_preferences where key = 'appearance'), 1, 'sees only their own appearance');
select is_empty($$ select 1 from user_preferences where key = 'appearance' and profile_id <> auth_profile_id() $$, 'others invisible');

select * from finish();
rollback;
