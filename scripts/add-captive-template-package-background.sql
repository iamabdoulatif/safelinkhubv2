-- Bandeau/image de fond personnalisable par org pour les portails « package ».
-- Miroir de la migration embarquée 0027_captive_template_package_background.
alter table captive_templates add column if not exists package_background_image text;
