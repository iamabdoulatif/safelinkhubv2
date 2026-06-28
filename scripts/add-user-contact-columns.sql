alter table users
  add column if not exists country text,
  add column if not exists phone_dial_code text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists telegram text;
