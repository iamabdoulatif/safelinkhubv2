-- Corbeille restaurable des tickets : migration additive et idempotente.
alter table vouchers add column if not exists deleted_at timestamp;

create index if not exists vouchers_org_deleted_created_idx
  on vouchers (org_id, deleted_at, created_at desc);
