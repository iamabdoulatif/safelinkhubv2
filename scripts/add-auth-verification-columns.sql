-- Email verification / account activation + password reset tokens.
-- Idempotent (safe to re-run). See src/lib/db/schema.ts (users) and
-- src/lib/auth/{tokens,email,actions}.ts.
alter table users
  add column if not exists email_verified boolean not null default false,
  add column if not exists activation_token_hash text,
  add column if not exists activation_token_expires_at timestamp,
  add column if not exists password_reset_token_hash text,
  add column if not exists password_reset_token_expires_at timestamp;

-- Backfill: every pre-existing account is considered already verified so the
-- new login gate never locks anyone out. Only accounts created AFTER this
-- migration (which insert with the false default) must go through activation.
update users set email_verified = true where email_verified = false;
