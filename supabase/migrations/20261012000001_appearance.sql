-- Appearance becomes personal (Paper that moves): each person gets an `appearance` preference derived from their old
-- `theme` preference and their firm's design system. Additive and idempotent: existing `theme` rows and
-- `firms.design_system` are left untouched; a later migration drops them once go-live is verified.
create or replace function appearance_from_legacy(p_theme text, p_design_system text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'theme', case when p_theme in ('light', 'dark', 'system') then p_theme else 'system' end,
    'accent', case p_design_system when 'ocean' then 'ocean' when 'forest' then 'fern' when 'sunset' then 'saffron' else 'midnight' end,
    'density', 'comfortable')
$$;

-- Never overwrites an existing appearance, so re-running is a no-op.
create or replace function backfill_appearance() returns void language sql set search_path = '' as $$
  insert into public.user_preferences (profile_id, key, value)
  select p.id, 'appearance', public.appearance_from_legacy(
    (select t.value #>> '{}' from public.user_preferences t where t.profile_id = p.id and t.key = 'theme'), f.design_system)
  from public.profiles p left join public.firms f on f.id = p.firm_id
  on conflict (profile_id, key) do nothing
$$;
revoke execute on function backfill_appearance() from public, anon, authenticated;

select backfill_appearance();

comment on column firms.design_system is 'DEPRECATED: unused since 20261012000001_appearance (appearance is per-person in user_preferences). Drop in a later migration after go-live is verified.';
