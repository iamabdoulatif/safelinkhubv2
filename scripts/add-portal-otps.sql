-- Vérification par OTP (SMS) du numéro du client AVANT paiement au portail
-- captif. Une ligne par (org, numéro international) : le code est stocké HASHÉ
-- (jamais en clair), `verified_at` mémorise la vérification ~30 min pour éviter
-- de redemander un OTP à chaque achat. Voir src/lib/db/schema.ts (portalOtps)
-- et src/lib/portal/otp.ts.
create table if not exists portal_otps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  phone text not null,            -- numéro international, chiffres uniquement
  code_hash text not null,        -- sha256(orgId:phone:code)
  attempts integer not null default 0,
  verified_at timestamp,          -- posé à la vérification, valide ~30 min
  expires_at timestamp not null,  -- validité du code (~5 min)
  last_sent_at timestamp not null default now(),
  created_at timestamp not null default now()
);

-- Un seul enregistrement OTP courant par (org, numéro) — l'envoi réécrit la ligne.
create unique index if not exists portal_otps_org_phone_idx
  on portal_otps (org_id, phone);
