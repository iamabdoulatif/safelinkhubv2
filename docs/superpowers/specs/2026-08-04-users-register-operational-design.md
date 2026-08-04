# Utilisateurs — registre opérationnel SafeLinkHub

## Objectif

Transformer `/admin/users` en un registre opérationnel calme et éditorial,
adapté au pilotage quotidien d’un superadmin comme à la gestion d’une équipe
cliente. La page doit mettre les accès nécessitant une action avant les
statistiques décoratives, sans modifier les droits, les données ou les actions
existantes.

## Direction retenue

**Registre opérationnel** : une seule surface de travail où la recherche, les
filtres et la liste des utilisateurs sont le centre de gravité. Le vocabulaire
visuel existant reste la référence : papier clair, encre foncée, traits noirs,
jaune SafeLinkHub pour l’action principale et couleurs sémantiques sobres pour
les états.

La page évite les gradients, les cartes arrondies génériques et la succession
de widgets égaux. Elle adopte une composition éditoriale : masthead, bande de
priorité, index, registre, puis outils secondaires.

## Structure de la page

### 1. Masthead compact

- Conserver le repère « Station de contrôle » et le titre `Utilisateurs`.
- Réduire la sensation de hero marketing : la zone doit présenter le contexte
  et non occuper l’écran.
- Garder deux actions seulement à droite : `Accès VPN` secondaire et
  `Exporter la liste` comme action jaune principale.
- En vue organisation (`?org=`), le titre et le texte restent ciblés sur
  l’organisation, sans modifier l’autorisation serveur déjà en place.

### 2. Bande de priorité

Remplacer le bloc de quatre statistiques visuellement équivalentes par une
seule bande bordée, composée de quatre informations :

1. **À traiter maintenant** : comptes dont le quota expire dans les 30 jours ;
   c’est le signal dominant, couleur d’alerte uniquement lorsque le compteur
   est non nul.
2. **Expirent bientôt** : le même total, accompagné d’un libellé temporel qui
   rend le signal explicite.
3. **VPN payant** : total des comptes en quota payant.
4. **Organisations actives** : total des organisations visibles.

Les compteurs doivent provenir uniquement des lignes déjà autorisées dans la
page. Aucun nouvel appel client ni agrégation non autorisée n’est introduit.
Pour une organisation ciblée, les libellés s’adaptent : `Membres visibles` et
`Routeurs du parc` remplacent les valeurs globales qui seraient redondantes.

### 3. Index du registre

- La recherche devient le premier élément de l’index.
- Les filtres rapides sont transformés de pilules arrondies en onglets/chips
  rectangulaires alignés à la recherche. Ils gardent tous les filtres existants
  (`Tous`, rôles, quotas et expiration) et leurs compteurs.
- Le filtre actif utilise l’encre, les autres restent sur papier avec trait
  noir. Les libellés sont courts et le nombre de filtres visible sur mobile est
  défilable horizontalement plutôt que compressé.
- Afficher un compteur de résultats et une remise à zéro discrète dans la même
  ligne de contexte.

### 4. Répertoire utilisateurs

- La table est la surface principale sur desktop ; les cartes mobiles restent
  fonctionnelles et reprennent la même hiérarchie (identité, statut d’accès,
  puis actions).
- Regrouper nom et email dans une colonne `Personne` avec un monogramme sobre
  dérivé du nom, sans avatar externe.
- Garder `Organisation` uniquement dans la vue superadmin globale. La masquer
  dans une fiche organisation, où elle est répétitive.
- Unifier rôle et quota sous un statut d’accès lisible : tonalité neutre par
  défaut, verte pour quota gratuit/illimité, ambre pour payant, rouge/ambre
  seulement pour une échéance proche.
- Conserver exactement les actions existantes (`Email`, `VPN`, `Accès
  distant`, quota) et leurs autorisations ; améliorer leur placement et leurs
  libellés sans créer de nouvelles permissions.

### 5. Contexte d’organisation

Pour `/admin/users?org=<id>` :

- Garder le filtrage serveur actuel et le panneau de résumé existant.
- Le transformer visuellement en bande de contexte compacte, placée entre la
  bande de priorité et l’index.
- Présenter le nom, les membres, les routeurs et leurs états, avec retour vers
  `Parcs clients` et lien vers la table technique seulement lorsqu’il existe.
- Ne jamais exposer d’autre organisation ni modifier les contrôles
  d’autorisation déjà validés.

### 6. Outils secondaires

Les `Passes d’accès temporaire` restent disponibles au superadmin mais passent
après le répertoire. Ils prennent la forme d’un panneau repliable en pied de
page : visible et identifiable, sans interrompre la recherche ni la table.

## Règles de cohérence visuelle

- Tous les contrôles structurants utilisent les traits noirs droits et le même
  rythme d’espacement ; les rayons arrondis sont retirés des filtres et badges
  de premier niveau.
- Le jaune SafeLinkHub est réservé à l’action primaire, à la sélection ou à un
  repère ; il n’est pas employé comme décoration répétée.
- Les couleurs vert, ambre et rouge indiquent exclusivement un état ou une
  urgence et restent accompagnées de texte.
- Les bordures légères séparent les données ; les bordures de 2 px marquent les
  groupes et les actions qui changent de contexte.
- Les liens et boutons gardent un focus clavier visible, les tableaux une
  légende accessible et les chiffres une lecture textuelle complète.

## Hors périmètre

- Aucun changement de schéma, de quota, de rôles, d’actions serveur ou de
  règles d’accès.
- Aucune nouvelle donnée d’activité, d’email vérifié ou de santé routeur n’est
  inventée dans l’interface.
- La page Routeurs, les paiements et les portails captifs ne sont pas modifiés.

## Vérification

- Mettre à jour les tests de rendu de `UsersControlCenter` et du panneau
  d’organisation pour les nouveaux libellés et l’ordre des zones.
- Vérifier les filtres, l’export CSV, la copie d’email, les quotas et les vues
  organisation/superadmin/client existantes.
- Exécuter tests ciblés, TypeScript, lint ciblé, build Next.js et contrôle
  navigateur desktop/mobile.
