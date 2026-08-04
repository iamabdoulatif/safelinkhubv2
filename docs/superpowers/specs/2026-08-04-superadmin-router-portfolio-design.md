# Superadmin — portefeuille de routeurs par organisation

## Objectif

Rendre la supervision superadmin lisible en séparant les routeurs appartenant à
SafeLinkHub de ceux des organisations clientes. Le superadmin doit pouvoir
passer d'un parc client à sa fiche Utilisateurs sans mélanger ces données dans
une seule table.

## Périmètre

Cette évolution ne concerne que l'affichage superadmin. Un administrateur
client conserve la page Routeurs actuelle, limitée à son organisation.

### `/admin/router`

La page superadmin propose deux onglets persistés dans l'URL :

1. **Mon parc** (`scope=mine`, valeur par défaut) : routeurs de
   l'organisation du superadmin connecté. La table, les filtres par statut, la
   recherche, la synchronisation et les liens de détail existants sont
   conservés.
2. **Parcs clients** (`scope=clients`) : les routeurs ne sont plus affichés
   dans une table globale. Ils sont regroupés par organisation sous forme de
   cartes compactes indiquant le total des routeurs et le nombre en ligne,
   hors ligne et en configuration.

Les cartes clientes ont deux actions :

- **Ouvrir l'organisation** vers `/admin/users?org=<organisationId>` ;
- **Voir les routeurs** vers `/admin/router?scope=clients&org=<organisationId>`.

Le second lien ouvre la table technique existante, filtrée sur cette unique
organisation. C'est une vue d'intervention, et non la vue par défaut.

Les filtres `status`, `q` et `org` continuent à être reflétés dans l'URL. Le
filtre d'organisation est limité aux organisations clientes dans le scope
`clients`; aucun routeur SafeLinkHub n'apparaît dans ce scope.

### `/admin/users`

Pour un superadmin, le paramètre valide `org` active une fiche d'organisation :

- bandeau avec le nom de l'organisation, le nombre d'utilisateurs et les
  compteurs de routeurs ;
- liste Utilisateurs préfiltrée sur l'organisation ;
- table compacte de ses routeurs, avec statut et accès aux détails ;
- lien clair de retour au portefeuille de clients (`/admin/router?scope=clients`).

Sans `org`, la station de contrôle Utilisateurs conserve son fonctionnement et
ses filtres actuels. Un administrateur non superadmin ne peut jamais appliquer
un autre `org` et reste limité à ses propres données.

## Modèle et flux de données

Les tables existantes `organizations`, `users` et `routers` suffisent. Aucun
changement de schéma ni migration n'est requis.

1. La page Routeurs lit l'organisation du superadmin connecté.
2. Elle sépare les routeurs par `routers.orgId` : l'organisation courante dans
   **Mon parc**, toutes les autres dans **Parcs clients**.
3. Les métriques clientes sont calculées côté serveur avant d'être passées au
   composant interactif.
4. La page Utilisateurs valide le paramètre `org` contre les organisations
   visibles au superadmin, charge seulement les utilisateurs et routeurs de
   cette organisation, puis affiche la fiche correspondante.

## Expérience et design

Le design reprend le système actuel : papier clair, traits noirs, jaune
SafeLinkHub, indicateurs verts/oranges et typographie éditoriale.

- Les deux onglets sont placés sous le titre « Routeurs MikroTik ».
- **Mon parc** reste la surface opérationnelle principale.
- **Parcs clients** privilégie des cartes aérées et scannables plutôt qu'une
  liste de lignes hétérogènes.
- Les compteurs de statut sont explicites afin qu'un incident client soit
  identifiable sans ouvrir toutes les fiches.
- Les mises en page mobile gardent les cartes en colonne et des cibles tactiles
  suffisamment grandes.

## Cas limites

- Un superadmin sans organisation ne voit pas de routeur dans **Mon parc** ;
  il peut toujours ouvrir les parcs clients.
- Une organisation cliente sans routeur apparaît avec un compteur à zéro si
  elle possède des utilisateurs ; elle reste donc accessible depuis
  Utilisateurs.
- Un identifiant `org` absent, invalide ou non autorisé retombe sur la vue
  Utilisateurs générale sans divulguer de données.
- Les liens routeur existants restent inchangés et conservent leurs contrôles
  d'autorisation.

## Vérification

- Tests unitaires de séparation des routeurs et d'agrégation par organisation.
- Tests des paramètres `scope` et `org`, dont l'isolation d'un admin client.
- Test de rendu ciblé : liens vers la fiche organisation et vers la vue
  technique filtrée.
- TypeScript, lint, build Next.js et vérification navigateur de la page
  superadmin et de la fiche d'une organisation.
