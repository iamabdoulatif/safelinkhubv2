-- Webhooks GeniusPay signés par organisation.
-- Migration additive et idempotente : les anciennes passerelles continuent de
-- fonctionner avec le polling jusqu'à ce que leur prochain achat crée le
-- webhook signé v2.
alter table payment_gateways
  add column if not exists webhook_id text,
  add column if not exists webhook_secret_encrypted text;
