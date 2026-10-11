begin;
select plan(19);

-- Pure mapping: every branch.
select is(appearance_from_legacy('light', 'default'), '{"theme":"light","accent":"midnight","density":"comfortable"}'::jsonb, 'default -> midnight');
select is(appearance_from_legacy('dark', 'ocean')->>'accent', 'ocean', 'ocean -> ocean');
select is(appearance_from_legacy('system', 'forest')->>'accent', 'fern', 'forest -> fern');
select is(appearance_from_legacy(null, 'sunset')->>'accent', 'saffron', 'sunset -> saffron');
select is(appearance_from_legacy('dark', null)->>'accent', 'midnight', 'no firm -> midnight');
select is(appearance_from_legacy('Dark', 'x')->>'theme', 'system', 'invalid theme -> system');
select is(appearance_from_legacy(null, null)->>'theme', 'system', 'no theme -> system');

-- Own fixture: clear whatever a seed or a manual backfill left, so the test is order-independent. The transaction rolls back at the end, which tears it down.
delete from user_preferences where key in ('theme', 'appearance');
select is((select count(*)::int from user_preferences where key = 'appearance'), 0, 'fixture cleared');


-- Fixtures as superuser: three profiles in alpha, one with a theme pref, plus one in a firm per design system.
update firms set design_system = 'forest' where id = '0000000a-0000-0000-0000-000000000001';
update firms set design_system = 'ocean' where name like 'Beta%';
insert into user_preferences (profile_id, key, value) values
  ((select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a1'), 'theme', '"dark"'),
  ((select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a2'), 'theme', '"bogus"');

-- Mapping under test is the migration body; re-run it via a function so it can run twice.
select backfill_appearance();

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
select backfill_appearance();
select is((select value->>'accent' from user_preferences u join profiles p on p.id = u.profile_id where p.email = 'owner@beta.test' and u.key = 'appearance'),
  'saffron', 'sunset firm -> saffron');

-- Idempotent: a user's later choice survives a re-run.
update user_preferences set value = '{"theme":"light","accent":"iris","density":"compact"}'
  where profile_id = (select id from profiles where user_id = '00000000-0000-0000-0000-0000000000a1') and key = 'appearance';
select backfill_appearance();
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
