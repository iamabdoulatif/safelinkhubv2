-- Comptes revendeurs : tarif d'installation remisé contre un pack annuel.
--
-- À passer AVANT le déploiement du code. Idempotent, additif, sans verrou long.
--
-- reseller_activated_at reste NULL tant que les 40 000 FCFA ne sont pas
-- encaissés : c'est cette colonne, et non account_type, qui ouvre la remise.
-- Demander le statut à l'inscription ne suffit jamais à l'obtenir.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS account_type           text    NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS reseller_activated_at  timestamp,
  ADD COLUMN IF NOT EXISTS reseller_expires_at    timestamp,
  ADD COLUMN IF NOT EXISTS reseller_quota_used    integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN organizations.account_type IS
  '''user'' | ''reseller'' — le statut DEMANDÉ, pas le statut payé.';
COMMENT ON COLUMN organizations.reseller_activated_at IS
  'NULL tant que le pack n''est pas encaissé. Conditionne la remise.';

COMMIT;
