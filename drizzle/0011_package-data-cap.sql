-- Plafond de VOLUME d'un forfait, en Mo.
--
-- Le couple upload_mbps / download_mbps borne la VITESSE d'un ticket ; rien ne
-- bornait ce qu'un client télécharge en 24 h. Sur un lien facturé au gigaoctet
-- (Starlink et consorts), c'est le volume qui décide de la facture.
--
-- Nullable et sans défaut À DESSEIN : null = « pas de plafond », soit le
-- comportement de tout le catalogue existant. Le plafond n'est PAS porté par le
-- profil hotspot (RouterOS ne sait pas le faire à ce niveau) : il est posé sur
-- chaque compte à sa création, via `=limit-bytes-total=`.
-- À appliquer AVANT le déploiement (le code lit la colonne).
ALTER TABLE "packages"
  ADD COLUMN IF NOT EXISTS "data_cap_mb" integer;
