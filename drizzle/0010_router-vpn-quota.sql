-- Quota VPN par ROUTEUR : surcharge celui de l'organisation.
--
-- Nullable et sans défaut À DESSEIN : null = « ce routeur suit son org », soit
-- exactement le comportement d'avant pour tout le parc existant. Seul un
-- routeur explicitement doté par le superadmin s'écarte de son organisation.
-- À appliquer AVANT le déploiement (le code lit les colonnes).
ALTER TABLE "routers"
  ADD COLUMN IF NOT EXISTS "vpn_quota_mode" text,
  ADD COLUMN IF NOT EXISTS "vpn_quota_expires_at" timestamp;
