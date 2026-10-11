create extension if not exists citext;

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create type member_status as enum ('invited', 'active');

create table members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email citext not null,
  full_name text,
  status member_status not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, email),
  unique (org_id, user_id)
);
create index members_user_id_idx on members(user_id);

-- Fixed list; the app mirrors it in src/rbac/permissions.ts.
create table permissions (
  key text primary key,
  grp text not null,
  label text not null
);
insert into permissions (key, grp, label) values
  ('forms.manage',      'Forms',     'Create and edit forms'),
  ('workflows.manage',  'Workflows', 'Create and edit workflows'),
  ('workflows.publish', 'Workflows', 'Publish workflows'),
  ('records.view_all',  'Records',   'View all records'),
  ('records.start',     'Records',   'Start records'),
  ('reports.view',      'Reports',   'View reports'),
  ('reports.manage',    'Reports',   'Create and edit reports'),
  ('comms.manage',      'Comms',     'Manage message templates'),
  ('comms.broadcast',   'Comms',     'Send campaigns'),
  ('members.manage',    'Admin',     'Invite and manage members'),
  ('roles.manage',      'Admin',     'Manage roles and permissions');

create table roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  is_system boolean not null default false,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);
create unique index roles_one_owner_per_org on roles(org_id) where is_owner;

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission text not null references permissions(key),
  primary key (role_id, permission)
);

create table member_roles (
  member_id uuid not null references members(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (member_id, role_id)
);
create index member_roles_role_id_idx on member_roles(role_id);

create table audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on audit_log(org_id, created_at desc);

alter table orgs enable row level security;
alter table members enable row level security;
alter table permissions enable row level security;
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table member_roles enable row level security;
alter table audit_log enable row level security;
