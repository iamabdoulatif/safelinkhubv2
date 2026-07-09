-- Colonnes ajoutées au schéma (branche feat/feature-access-gate) mais jamais
-- migrées sur Neon → le build v14 (qui les SELECT/INSERT) plantait en 500.
--   * payment_reference : référence GeniusPay sur les autorisations payantes.
--   * vouchers.router_id / profile_name : provisioning voucher RÉEL sur MikroTik.
-- Additif et idempotent (add column if not exists).
alter table remote_access_authorizations add column if not exists payment_reference text;
alter table auto_setup_authorizations add column if not exists payment_reference text;
alter table vouchers add column if not exists router_id uuid references routers(id) on delete set null;
alter table vouchers add column if not exists profile_name text;
