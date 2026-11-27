-- « Appareils par code » (shared-users des profils hotspot vendables).
-- Miroir de la migration embarquée 0031_devices_per_voucher (src/lib/db/migrations.ts).
-- 1 = anti-partage (défaut historique).
alter table organizations add column if not exists devices_per_voucher integer not null default 1;
