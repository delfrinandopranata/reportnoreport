-- Appearance becomes personal (Paper that moves): each person gets an `appearance` preference derived from their old
-- `theme` preference and their firm's design system. Additive and idempotent: existing `theme` rows and
-- `firms.design_system` are left untouched; a later migration drops them once go-live is verified.
insert into user_preferences (profile_id, key, value)
select p.id, 'appearance', jsonb_build_object(
  'theme', coalesce((select t.value #>> '{}' from user_preferences t
                     where t.profile_id = p.id and t.key = 'theme' and t.value #>> '{}' in ('light', 'dark', 'system')), 'system'),
  'accent', case f.design_system when 'ocean' then 'ocean' when 'forest' then 'fern' when 'sunset' then 'saffron' else 'midnight' end,
  'density', 'comfortable')
from profiles p left join firms f on f.id = p.firm_id
on conflict (profile_id, key) do nothing;

comment on column firms.design_system is 'DEPRECATED: unused since 20261012000001_appearance (appearance is per-person in user_preferences). Drop in a later migration after go-live is verified.';
