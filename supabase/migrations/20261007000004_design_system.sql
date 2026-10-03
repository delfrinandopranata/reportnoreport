-- Firm-level visual identity choice (like the logo), independent of each person's own light/dark preference.
-- Every member of a firm sees the same design system. Gated by the existing firms_update RLS policy
-- (auth_can('settings.manage') and firm_can_write(id)) since it is just another firm column.
alter table firms add column design_system text not null default 'default'
  check (design_system in ('default', 'ocean', 'forest', 'sunset'));
