create table if not exists public_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  ip_address text not null,
  created_at timestamp not null default now()
);

create index if not exists public_submission_attempts_bucket_ip_created_at_idx
  on public_submission_attempts (bucket, ip_address, created_at);
