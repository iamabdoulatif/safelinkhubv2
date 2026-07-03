create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content text not null,
  published boolean not null default false,
  published_at timestamp,
  created_by uuid references users(id) on delete set null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  status text not null default 'new',
  created_at timestamp not null default now()
);
