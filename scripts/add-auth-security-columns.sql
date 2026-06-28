alter table users
  add column if not exists mfa_secret_encrypted text,
  add column if not exists mfa_enabled boolean not null default false,
  add column if not exists mfa_backup_codes_hash text;

create table if not exists login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_address text not null,
  success boolean not null,
  created_at timestamp not null default now()
);

create index if not exists login_attempts_email_created_at_idx on login_attempts (email, created_at);
create index if not exists login_attempts_ip_created_at_idx on login_attempts (ip_address, created_at);
