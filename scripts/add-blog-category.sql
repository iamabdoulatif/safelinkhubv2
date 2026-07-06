-- Catégorie / sujet des articles de blog (texte libre, superadmin) — alimente
-- la sidebar de filtres du blog public.
alter table blog_posts add column if not exists category text;
