create table if not exists centers (
  id text primary key,
  name text not null,
  objective_annual bigint not null default 0
);

create table if not exists ifus (
  id uuid primary key default gen_random_uuid(),
  center_id text not null references centers(id) on delete cascade,
  code text not null,
  label text not null,
  sectors text[] not null default '{}',
  unique (center_id, code)
);

create table if not exists taxpayers (
  id uuid primary key default gen_random_uuid(),
  center_id text not null references centers(id) on delete cascade,
  external_id text not null,
  name text not null,
  sector text not null,
  company_type text not null,
  ca bigint not null default 0,
  debt bigint not null default 0,
  age_days int not null default 0,
  status text not null default 'Normal',
  ifu text not null default 'IFU 5',
  notes text,
  last_action_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (center_id, external_id)
);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  center_id text not null references centers(id) on delete cascade,
  taxpayer_external_id text not null,
  type text not null,
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create table if not exists week_plans (
  center_id text primary key references centers(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_taxpayers_center on taxpayers(center_id);
create index if not exists idx_taxpayers_ifu on taxpayers(center_id, ifu);
create index if not exists idx_taxpayers_debt on taxpayers(center_id, debt desc);
create index if not exists idx_actions_center on actions(center_id, at desc);
