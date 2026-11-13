-- Version d'habillage MikHmon réellement déposée + servie sur le routeur (après
-- redémarrage du conteneur). Null = jamais appliquée → la synchro dépose les
-- fichiers d'habillage et redémarre le conteneur une fois, puis enregistre la
-- version. Miroir de la migration embarquée 0026_mikhmon_ui_version.
alter table routers add column if not exists mikhmon_ui_version text;
