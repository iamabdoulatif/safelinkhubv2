alter table organizations
  add column if not exists vpn_quota_mode text not null default 'default',
  add column if not exists vpn_quota_expires_at timestamp;

update organizations
set vpn_quota_mode = 'default'
where vpn_quota_mode is null;
