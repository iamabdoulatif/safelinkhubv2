-- Verrou anti-abus de l'auto-setup : un MikroTik (par numéro de série) ne peut
-- être auto-configuré qu'une fois. Voir src/lib/db/schema.ts (routerSerialLocks)
-- et src/lib/mikrotik/router-serial-lock.ts.
create table if not exists router_serial_locks (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null unique,
  router_id uuid references routers(id) on delete set null,
  org_id uuid references organizations(id) on delete set null,
  locked_at timestamp not null default now(),
  released_at timestamp,
  released_by uuid references users(id) on delete set null
);
