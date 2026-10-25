-- Passerelle de paiement par commande portail (GeniusPay par défaut, CinetPay
-- pour MTN/Moov en API directe). Détermine quelle API /status et la
-- réconciliation interrogent. Miroir embarqué : migrations.ts 0022.
alter table portal_orders add column if not exists provider text not null default 'genius_pay';
