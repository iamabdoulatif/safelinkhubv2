alter table router_regulation add column if not exists fup_ticket_policy jsonb;
alter table router_regulation add column if not exists fup_ticket_state jsonb;
