# Registre d’exploitation des parcs clients

**Statut :** direction UI/UX validée par l’utilisateur le 1er septembre 2026.

## Contexte

La vue `admin/router?scope=clients` présente aujourd’hui chaque organisation dans une grande carte. La répétition des cadres, des trois blocs de statut et de deux boutons d’action donne une lecture mécanique : toutes les organisations semblent avoir la même priorité et une même densité, même lorsqu’aucune action n’est nécessaire.

La direction retenue est **B — Registre d’exploitation**. Elle doit faire de cette page un outil de supervision rapide, calme et crédible, et non un catalogue de cartes.

## Objectifs

- Identifier les organisations qui demandent une action en moins de trois secondes.
- Comparer les états et le volume de routeurs sans ouvrir plusieurs cartes.
- Donner une seule action de navigation non ambiguë par organisation.
- Préserver une expérience tactile simple sur mobile, sans tenter de réduire une table de bureau.
- Utiliser exclusivement les données déjà disponibles dans le chargement de la page ; aucune migration ni donnée inventée.

## Hors périmètre

- Modifier la fiche d’un routeur, ses actions de maintenance ou la vue d’un parc sélectionné.
- Ajouter une carte géographique, un graphique temporel ou une nouvelle source de télémétrie.
- Changer les droits d’accès : la vue reste réservée au superadministrateur et ne montre que les organisations auxquelles il a déjà accès.

## Architecture de l’information

1. En-tête existant : titre, description, puis le sélecteur « Mon parc / Parcs clients ».
2. Bandeau de synthèse : organisations suivies, routeurs gérés, routeurs en ligne et organisations à traiter.
3. Barre de travail : recherche, filtres d’état, tri par priorité et nombre de résultats.
4. Alerte de priorité, affichée seulement si au moins une organisation est hors ligne ou à configurer.
5. Registre des organisations, une ligne par organisation.
6. État vide ou état « aucun résultat » utile selon le contexte.

Le bandeau de synthèse donne le contexte ; la table prend ensuite toute l’attention. Les actions secondaires ne sont plus répétées à chaque ligne.

## Bureau et tablette large

### Synthèse

Le bloc de synthèse est une seule surface discrète, divisée par de fins séparateurs. Il affiche :

| Indicateur | Source | Règle |
| --- | --- | --- |
| Organisations suivies | `clients.length` | Toujours affiché. |
| Routeurs gérés | Somme de `routerCounts.total` | Toujours affiché. |
| Routeurs connectés | Somme de `routerCounts.online` | Texte ou point vert, sans grand aplat. |
| À traiter | Organisations avec au moins un routeur hors ligne ou en configuration | Accent rouge ou orange réservé à ce nombre. |

### Barre de travail

- Recherche par nom d’organisation.
- Filtre d’état : Tous, À traiter, En ligne, À configurer, Hors ligne, Sans routeur.
- Tri par priorité par défaut ; alternatives : nom et dernière synchronisation.
- Nombre de résultats à droite.

Les filtres se conservent dans l’URL afin que le lien soit partageable et que le retour depuis la fiche d’un parc ne perde pas le contexte. Les paramètres prévus sont `q`, `clientStatus` et `clientSort`, tout en préservant `scope=clients` et `org` quand il existe.

### Alerte de priorité

Une seule alerte compacte apparaît au-dessus du registre lorsqu’il y a des organisations prioritaires. Elle indique leur nombre et offre le raccourci « Voir uniquement ». Elle n’est jamais affichée si le portefeuille est sain.

### Colonnes du registre

| Colonne | Contenu | Comportement |
| --- | --- | --- |
| Organisation | Nom, marque routeur discrète, libellé « Parc client » | Colonne principale, troncature avec infobulle accessible si nécessaire. |
| État | Point coloré et libellé explicite | La couleur ne porte jamais l’information seule. |
| Routeurs | Total suivi de « routeur(s) » | Aligné pour la comparaison. |
| Dernière synchronisation | Date la plus récente des routeurs de l’organisation | `—` si aucun routeur n’a de synchronisation. |
| Membres | Effectif de l’organisation | Valeur compacte. |
| Navigation | Flèche | Toute la ligne est cliquable et mène au parc filtré. |

Les deux boutons actuels « Ouvrir l’organisation » et « Voir les routeurs » disparaissent de la liste. La ligne ouvre `/admin/router?scope=clients&org=<id>`. Les actions de gestion d’organisation restent disponibles dans la fiche ou dans l’espace Utilisateurs ; elles ne concurrencent plus la tâche de supervision.

### Règles d’état

1. **Hors ligne** si `offline > 0` : priorité la plus haute, point rouge.
2. **À configurer** si `configuring > 0` : seconde priorité, point orange.
3. **En attente** si `total === 0` : état neutre, point gris ; ce n’est pas une alerte rouge.
4. **Tout va bien** si les routeurs sont en ligne et qu’aucun état prioritaire n’est présent : point vert.

Un libellé de statut reste explicite dans toutes les vues. Aucun grand encadré vert, orange ou rouge n’est utilisé par ligne.

## Responsive

| Largeur | Présentation | Règles |
| --- | --- | --- |
| `>= 1024 px` | Table complète | Six colonnes, synthèse en bandeau horizontal. |
| `768–1023 px` | Table compacte | Masquer d’abord Membres, puis Dernière synchronisation ; conserver Organisation, État, Routeurs et navigation. |
| `< 768 px` | File d’intervention | Remplacer la table par des lignes-listes à une colonne, jamais par une table défilante horizontalement. |

Sur mobile :

- En-tête compact avec recherche accessible via bouton ou champ plein largeur.
- Filtres sous forme de puces défilables horizontalement ; « À traiter » est sélectionné par défaut uniquement lorsqu’il existe une priorité.
- Chaque ligne liste : nom, statut, nombre de routeurs et dernière synchronisation ou nombre de membres selon le contexte utile.
- Zone tactile complète de 44 px minimum ; flèche de navigation à droite.
- L’utilisateur peut afficher les organisations saines après les priorités, afin que les incidents restent en tête sans masquer le portefeuille.

## Données et composants

La page charge déjà `lastSyncAt` pour chaque routeur. La construction des portefeuilles doit donc étendre `ClientPortfolio` avec :

```ts
lastSyncAtMs: number | null
```

Cette valeur est le maximum des synchronisations connues des routeurs de l’organisation. Aucun appel réseau supplémentaire et aucune migration ne sont requis.

Les responsabilités attendues sont :

- `router-portfolio.ts` : agrégation de l’état, de la dernière synchronisation et du score de priorité ; fonctions pures testables.
- `ClientPortfolioRegistry.tsx` : orchestrateur de présentation, filtres et résultats.
- `ClientPortfolioSummary.tsx` : bandeau de synthèse.
- `ClientPortfolioToolbar.tsx` : recherche, filtres et tri.
- `ClientPortfolioTable.tsx` : registre bureau/tablette.
- `ClientPortfolioMobileList.tsx` : file mobile, rendue à la place de la table via CSS et structure adaptée.

Le composant actuel `ClientPortfolioGrid.tsx` est remplacé par cet ensemble. La vue d’un parc précis conserve `RoutersTable` et son lien retour.

## Accessibilité et qualité perçue

- Les lignes sont de vrais liens ou contiennent un lien couvrant clairement la zone ; navigation clavier et anneau de focus visible.
- Les statuts associent point, texte et ordre de priorité. Aucune information ne dépend uniquement de la couleur.
- Les en-têtes de table utilisent les éléments sémantiques `table`, `thead`, `th` et une étiquette de navigation pour la version liste.
- Les organisations sans routeur sont renseignées par un état neutre et une explication, sans ton alarmiste.
- Les noms longs ne dictent pas la hauteur de toute une carte : ils sont gérés par troncature sur bureau et retour à la ligne maîtrisé sur mobile.

## Tests d’acceptation

1. Les agrégats total, en ligne, prioritaire et dernière synchronisation sont corrects pour plusieurs routeurs et pour une organisation vide.
2. L’ordre par défaut place hors ligne, puis à configurer, puis en attente, puis sain.
3. Les filtres et la recherche donnent le même résultat sur table et liste mobile, et sont conservés dans l’URL.
4. Chaque ligne pointe vers le parc client approprié ; les anciens doubles boutons ne sont plus rendus.
5. Les états vide, sans résultat et sans routeur ont un libellé clair.
6. Les tests de rendu couvrent les points de rupture logique et les libellés accessibles.

## Critère de réussite

Un utilisateur qui arrive sur la vue identifie immédiatement les organisations qui nécessitent une intervention, peut filtrer ou ouvrir un parc en une action, et obtient la même compréhension sur téléphone sans voir une grille de cartes réduites.
