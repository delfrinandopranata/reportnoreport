create extension if not exists pgcrypto;

create type firm_status    as enum ('active', 'suspended');
create type firm_source    as enum ('self_serve', 'admin');
create type billing_status as enum ('trial', 'paid', 'complimentary', 'read_only');
create type member_role    as enum ('owner', 'admin', 'accountant', 'viewer');
create type member_status  as enum ('active', 'invited', 'suspended');
create type client_type    as enum ('company', 'individual');
create type client_status  as enum ('active', 'inactive', 'archived');
create type txn_kind       as enum ('receipt', 'payment');
create type change_action  as enum ('insert', 'update', 'delete', 'support_access', 'billing');

-- Sets updated_at and the acting user on every write. auth.uid() is null for service-role writes.
create or replace function stamp_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  trading_name text not null default '',
  registration_no text not null default '',
  sst_no text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  address1 text not null default '',
  address2 text not null default '',
  postcode text not null default '',
  city text not null default '',
  state text not null default '',
  country text not null default 'Malaysia',
  logo_path text,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  statement_note text not null default 'Please review this statement and notify us of any discrepancies within {days} days of the statement date.',
  discrepancy_days int not null default 14 check (discrepancy_days between 1 and 365),
  show_registration_on_statement boolean not null default true,
  fy_start_month int not null default 1 check (fy_start_month between 1 and 12),
  date_format text not null default 'text' check (date_format in ('text', 'numeric')),
  status firm_status not null default 'active',
  source firm_source not null default 'admin',
  billing_status billing_status not null default 'trial',
  trial_ends_at timestamptz,
  paid_at timestamptz,
  stripe_customer_id text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint trial_has_end check (billing_status <> 'trial' or trial_ends_at is not null)
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  firm_id uuid references firms(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email text not null,
  role member_role not null default 'viewer',
  status member_status not null default 'invited',
  last_active_at timestamptz,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint super_admin_has_no_firm check (is_super_admin = (firm_id is null))
);
create unique index profiles_email_key on profiles (lower(email));
create index profiles_firm_idx on profiles (firm_id);

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  bank_name text not null default '',
  account_name text not null default '',
  account_no text not null default '',
  is_default boolean not null default false,
  is_active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index bank_accounts_firm_idx on bank_accounts (firm_id);

create table clients (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  type client_type not null default 'company',
  name text not null check (length(trim(name)) > 0),
  registration_no text not null default '',
  industry text not null default '',
  contact text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  address1 text not null default '',
  address2 text not null default '',
  postcode text not null default '',
  city text not null default '',
  state text not null default '',
  country text not null default 'Malaysia',
  status client_status not null default 'active',
  tags text[] not null default '{}',
  assigned_to uuid references profiles(id) on delete set null,
  notes text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index clients_firm_name_idx on clients (firm_id, lower(name));

create table transactions (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  bank_account_id uuid not null references bank_accounts(id) on delete restrict,
  kind txn_kind not null,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000000),
  date date not null,
  description text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
create index transactions_firm_date_idx on transactions (firm_id, date, created_at);
create index transactions_client_date_idx on transactions (client_id, date, created_at);
create index transactions_bank_idx on transactions (bank_account_id);

create table change_log (
  id bigint generated always as identity primary key,
  firm_id uuid references firms(id) on delete cascade,
  table_name text not null,
  row_id uuid,
  action change_action not null,
  before jsonb,
  after jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index change_log_firm_at_idx on change_log (firm_id, at desc);

create table user_preferences (
  profile_id uuid not null references profiles(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, key)
);

create table platform_settings (
  id boolean primary key default true check (id),
  firm_cap int not null default 5 check (firm_cap >= 0),
  trial_days int not null default 14 check (trial_days between 1 and 365)
);
insert into platform_settings default values;

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  firm_name text not null default '',
  created_at timestamptz not null default now()
);

create table stripe_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create trigger stamp before insert or update on firms         for each row execute function stamp_row();
create trigger stamp before insert or update on profiles      for each row execute function stamp_row();
create trigger stamp before insert or update on bank_accounts for each row execute function stamp_row();
create trigger stamp before insert or update on clients       for each row execute function stamp_row();
create trigger stamp before insert or update on transactions  for each row execute function stamp_row();

alter table firms             enable row level security;
alter table profiles          enable row level security;
alter table bank_accounts     enable row level security;
alter table clients           enable row level security;
alter table transactions      enable row level security;
alter table change_log        enable row level security;
alter table user_preferences  enable row level security;
alter table platform_settings enable row level security;
alter table waitlist          enable row level security;
alter table stripe_events     enable row level security;
