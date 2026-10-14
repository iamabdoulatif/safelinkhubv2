-- Miroir de la migration embarquée 0014 (voir src/lib/db/migrations.ts).
create table if not exists agent_link_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  token_hash text not null unique,
  label text,
  expires_at timestamp not null,
  last_used_at timestamp,
  revoked_at timestamp,
  created_at timestamp not null default now()
);
create index if not exists agent_link_tokens_org_idx on agent_link_tokens (org_id);
