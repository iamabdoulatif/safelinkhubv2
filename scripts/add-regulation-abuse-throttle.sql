-- Miroir humain de la migration embarquée 0012_regulation_abuse_throttle (src/lib/db/migrations.ts).
-- Débit laissé au téléchargeur abusif pendant son bridage (avant blocage).
alter table router_regulation
  add column if not exists abuse_throttle_limit text not null default '256k/256k';
