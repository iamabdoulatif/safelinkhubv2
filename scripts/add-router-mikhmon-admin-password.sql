alter table routers
  add column if not exists mikhmon_admin_password_encrypted text;
