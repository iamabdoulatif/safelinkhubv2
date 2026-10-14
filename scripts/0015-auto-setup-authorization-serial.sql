-- Miroir de la migration embarquée 0015 (voir src/lib/db/migrations.ts).
alter table auto_setup_authorizations
  add column if not exists serial_number text;
create index if not exists auto_setup_authorizations_serial_idx on auto_setup_authorizations (org_id, serial_number);
