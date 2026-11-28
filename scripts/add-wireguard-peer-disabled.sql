alter table routers
  add column if not exists wireguard_peer_disabled boolean not null default false;
