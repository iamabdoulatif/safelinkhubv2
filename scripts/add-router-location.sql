-- Localisation physique d'une zone (routeur) : coordonnées + adresse.
--
-- latitude/longitude en colonnes parce qu'elles seules se filtrent et se
-- trient (carte du parc, « zones à moins de 5 km »). Les lignes d'adresse
-- restent du texte modifiable : le géocodage inverse se trompe sur les rues
-- d'Abidjan et l'opérateur doit pouvoir corriger sans toucher au point.
-- Additive et rejouable.
alter table routers
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists location_street text,
  add column if not exists location_neighbourhood text,
  add column if not exists location_commune text,
  add column if not exists location_country text;
