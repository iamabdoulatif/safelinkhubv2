-- Accès LOCAL MikHmon : drapeau de réconciliation (une fois par routeur).
-- Non-null = le dst-nat 8087 + les accepts walled-garden ont été posés par la
-- synchro. Miroir de la migration embarquée 0024_mikhmon_local_access.
alter table routers add column if not exists mikhmon_local_access_at timestamp;
