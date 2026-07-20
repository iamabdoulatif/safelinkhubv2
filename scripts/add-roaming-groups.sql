-- Groupes roaming : migration additive et idempotente.
create table if not exists roaming_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  code text not null,
  active boolean not null default true,
  created_at timestamp not null default now()
);

create unique index if not exists roaming_groups_org_code_idx
  on roaming_groups (org_id, code);
create index if not exists roaming_groups_org_created_idx
  on roaming_groups (org_id, created_at desc);

create table if not exists roaming_group_routers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  group_id uuid not null references roaming_groups(id) on delete cascade,
  router_id uuid not null references routers(id) on delete cascade,
  created_at timestamp not null default now()
);

create unique index if not exists roaming_group_routers_group_router_idx
  on roaming_group_routers (group_id, router_id);
create index if not exists roaming_group_routers_org_router_idx
  on roaming_group_routers (org_id, router_id);

create table if not exists roaming_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  duration_value integer not null,
  duration_unit text not null default 'Hours',
  upload_mbps integer not null default 5,
  download_mbps integer not null default 5,
  default_price_cents integer not null,
  active boolean not null default true,
  created_at timestamp not null default now()
);

create unique index if not exists roaming_profiles_org_name_idx
  on roaming_profiles (org_id, name);
create index if not exists roaming_profiles_org_active_idx
  on roaming_profiles (org_id, active);

create table if not exists roaming_group_offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  group_id uuid not null references roaming_groups(id) on delete cascade,
  profile_id uuid not null references roaming_profiles(id) on delete restrict,
  price_override_cents integer,
  active boolean not null default true,
  created_at timestamp not null default now()
);

create unique index if not exists roaming_group_offers_group_profile_idx
  on roaming_group_offers (group_id, profile_id);
create index if not exists roaming_group_offers_org_group_idx
  on roaming_group_offers (org_id, group_id);

alter table vouchers add column if not exists roaming_group_id uuid
  references roaming_groups(id) on delete set null;
alter table vouchers add column if not exists roaming_profile_id uuid
  references roaming_profiles(id) on delete set null;
alter table vouchers add column if not exists sold_price_cents integer;

create index if not exists vouchers_roaming_group_idx
  on vouchers (roaming_group_id);
