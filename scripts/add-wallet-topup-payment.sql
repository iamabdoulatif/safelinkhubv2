-- Dépôts portefeuille via passerelle : les lignes pending ne doivent pas
-- être incluses dans le solde avant le webhook Genius Pay signé.
alter table wallet_transactions
  add column if not exists status text not null default 'completed',
  add column if not exists payment_reference text,
  add column if not exists payment_method text,
  add column if not exists country_iso2 text;

create index if not exists wallet_transactions_payment_reference_idx
  on wallet_transactions (payment_reference);
