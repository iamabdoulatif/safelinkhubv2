-- Marqueur d'intention sur un dépôt portefeuille.
--
-- Nécessaire pour distinguer les 40 000 FCFA du pack revendeur d'une recharge
-- ordinaire du même montant : sans lui, un client qui recharge 40 000 FCFA
-- deviendrait revendeur par accident.
--
-- À passer AVANT le déploiement. Idempotent, additif.

BEGIN;

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'topup';

COMMENT ON COLUMN wallet_transactions.purpose IS
  '''topup'' | ''reseller_pack'' — ce que le dépôt déclenche à la confirmation.';

COMMIT;
