# Carte choroplèthe mondiale des comptes

## Objectif

Remplacer le panneau « Comptes par pays » du tableau de bord administrateur par
une carte mondiale colorée par pays. Chaque pays doit permettre de comprendre
rapidement son poids dans le total des comptes, sans changer la requête ni les
règles métier existantes.

## Direction visuelle

- Carte mondiale sombre, cohérente avec la référence fournie.
- Les pays sont remplis avec une échelle monochrome allant du ton clair au
  ton de marque foncé, selon le nombre de comptes.
- Les pays sans compte restent visibles avec un fond neutre et discret.
- Une légende indique l’échelle « moins de comptes » → « plus de comptes ».
- Le total de comptes reste visible dans l’en-tête de la carte.
- Au survol ou au clic d’un pays, une info-bulle affiche son nom, le nombre de
  comptes et son pourcentage du total.
- Les comptes « Non renseigné » sont présentés dans un encart sous la carte,
  car ils ne peuvent pas être géolocalisés.

## Architecture

`DashboardView` conserve la réception des données `CountryRow[]` et délègue le
rendu cartographique à un composant client isolé, par exemple
`AccountsCountryMap`.

Le composant client charge Leaflet et la géométrie mondiale uniquement côté
navigateur et après rendu de la section. La géométrie est stockée dans un
fichier statique local optimisé, avec un identifiant ISO2 par pays. Aucun appel
réseau externe ne sera requis pour afficher la carte.

Le serveur continue d’utiliser `getAccountsByCountry()` comme source unique des
comptes et pourcentages. Le composant construit une table ISO2 → métriques,
ignore les pays sans correspondance et garde les lignes sans ISO2 dans le
résumé « Non renseigné ».

## Interactions et accessibilité

- Les pays sont navigables au clavier comme éléments interactifs.
- Une info-bulle est complétée par une fiche sélectionnée persistante sur clic,
  utilisable sur mobile où le survol n’existe pas.
- Les mêmes valeurs sont disponibles dans un résumé textuel accessible sous la
  carte afin de ne pas dépendre uniquement de la couleur.
- Un état de chargement et un état d’erreur local sont prévus pour la géométrie.
- La carte est responsive : hauteur généreuse sur desktop, hauteur contenue sur
  mobile, sans débordement horizontal.

## Données et calculs

- Le nombre affiché est `accounts`.
- Le pourcentage affiché est `share * 100`, arrondi à l’entier comme dans le
  panneau actuel.
- La couleur est calculée à partir du maximum de comptes parmi les pays
  géolocalisés, avec un minimum visuel pour les petits volumes.
- Les pays sans données restent neutres ; ils ne contribuent pas au total.
- « Non renseigné » n’est pas transformé en pays fictif.

## Vérification

- Test de type et lint du composant et du fichier de géométrie.
- Test unitaire du calcul des couleurs et de l’association ISO2 → métriques.
- Vérification visuelle desktop et mobile sur le dashboard avec les données
  d’exemple de la capture : Côte d’Ivoire 42 (88 %), Mali 1 (2 %), non
  renseigné 5 (10 %).
- Vérification que la page reste rendable lorsque `countries` est vide ou que
  la géométrie échoue à charger.
