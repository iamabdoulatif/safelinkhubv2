-- Réglages marketing globaux (pixels & analytics), gérés par le superadmin.
-- Singleton : une seule ligne, injectée dans le <head> du site public.
create table if not exists marketing_settings (
  id uuid primary key default gen_random_uuid(),
  meta_pixel_id text,
  ga4_measurement_id text,
  gtm_id text,
  tiktok_pixel_id text,
  adsense_client_id text,
  adsense_slot_id text,
  adsense_enabled boolean not null default false,
  updated_at timestamp not null default now()
);

-- Amorce la ligne singleton si la table est vide.
insert into marketing_settings (id)
select gen_random_uuid()
where not exists (select 1 from marketing_settings);
