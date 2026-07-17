-- Demandes de déblocage d'un verrou de série MikroTik, validées par le
-- superadmin (support). Quand un MikroTik (par SN) est rattaché à un autre
-- compte, l'utilisateur bloqué envoie une demande ; le superadmin l'approuve
-- (libère le verrou → SN ré-utilisable) ou la refuse. Idempotent. Voir
-- src/lib/db/schema.ts (routerSerialUnlockRequests) et
-- src/lib/mikrotik/serial-unlock-*.ts.
create table if not exists router_serial_unlock_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  requester_email text not null,
  requester_name text not null,
  -- Numéro de série du MikroTik dont on demande le déblocage.
  serial_number text not null,
  -- Routeur (côté demandeur) qui a déclenché le blocage — facultatif.
  router_id uuid references routers(id) on delete set null,
  router_name text,
  -- Message libre facultatif joint par le demandeur.
  note text,
  status text not null default 'pending', -- pending | approved | rejected
  decided_at timestamp,
  decided_by uuid references users(id) on delete set null,
  admin_note text,
  created_at timestamp not null default now()
);

-- Recherche fréquente : dernière demande pour un SN + une org (état UI).
create index if not exists router_serial_unlock_requests_lookup_idx
  on router_serial_unlock_requests (serial_number, org_id, created_at);
-- File d'attente superadmin.
create index if not exists router_serial_unlock_requests_pending_idx
  on router_serial_unlock_requests (status, created_at);
