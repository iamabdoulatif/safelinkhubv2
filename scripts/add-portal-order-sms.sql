-- Suivi et reprise de l'envoi SMS des commandes portail.
-- Les commandes historiques sont considérées comme « sent » pour ne jamais
-- renvoyer un SMS déjà délivré lors de la migration. Les nouvelles commandes
-- sont explicitement créées en « pending » par l'API portail.
alter table portal_orders
  add column if not exists sms_status text not null default 'sent',
  add column if not exists sms_message_id text,
  add column if not exists sms_error text,
  add column if not exists sms_attempts integer not null default 0,
  add column if not exists sms_last_attempt_at timestamp,
  add column if not exists sms_sent_at timestamp;

-- Une commande encore payée/en cours au moment de la migration doit recevoir
-- son SMS quand elle sera honorée. Les commandes déjà fulfilled restent sent
-- pour ne pas dupliquer un message historique.
update portal_orders
set sms_status = 'pending'
where status in ('pending', 'paid', 'fulfilling')
  and sms_status = 'sent';

create index if not exists portal_orders_sms_retry_idx
  on portal_orders (status, sms_status, sms_last_attempt_at);
