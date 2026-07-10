-- Témoignages soumis par les visiteurs de la landing (modérés : seuls les
-- "approved" s'affichent). Voir src/lib/db/schema.ts (testimonials),
-- src/lib/testimonials/ et le composant Testimonials.tsx.
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  role text,
  quote text not null,
  rating integer,
  status text not null default 'pending', -- pending | approved | hidden
  created_at timestamp not null default now()
);

create index if not exists testimonials_status_idx on testimonials (status);
