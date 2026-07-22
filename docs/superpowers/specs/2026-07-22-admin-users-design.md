# Refonte UI/UX de la station Utilisateurs

## Intention

Faire de `/admin/users` une station de contrôle aérée et immédiatement lisible pour un superadmin. L’écran doit répondre dans cet ordre : combien de comptes sont suivis, lesquels demandent une attention, puis quelle action effectuer.

## Direction visuelle

Direction « console éditoriale » : fond ivoire, encre noire, jaune SafeLinkHub réservé aux actions et états actifs, bordures fines, espaces généreux et typographie déjà utilisée par le SaaS. Les cartes métriques deviennent une bande de synthèse compacte plutôt que quatre blocs lourds. Les zones importantes gardent un contraste fort sans ajouter de nouvelles couleurs ou de nouveaux composants.

## Structure retenue

1. En-tête de page : libellé de section, titre, phrase d’aide et actions secondaires alignées à droite.
2. Bande de synthèse : quatre indicateurs dans une grille calme, avec une hiérarchie de valeur plus forte et moins de bordures visuelles.
3. Section superadmin : passes temporaires dans un `<details>` replié par défaut. Un résumé indique le nombre de passes récentes ; l’ouverture donne accès au formulaire complet et à l’historique.
4. Barre de contrôle : recherche pleine largeur, compteur de résultat, filtres sous forme de segments et remise à zéro discrète.
5. Résultats : tableau desktop avec densité réduite, colonnes mieux alignées et actions regroupées ; cartes mobiles conservées avec les mêmes priorités.

## Comportement

- Les filtres et la recherche continuent à filtrer côté client sans rechargement.
- Le quota reste visible dans la ligne et son formulaire reste directement utilisable par le superadmin.
- Le bouton d’export exporte exactement les lignes filtrées.
- Les passes temporaires ne sont pas supprimés ni modifiés fonctionnellement ; leur repli réduit seulement le bruit initial.
- Tous les contrôles restent accessibles au clavier, avec libellés explicites et états `disabled` préservés.

## Périmètre technique

- Modifier `src/app/admin/users/UsersControlCenter.tsx` pour la composition visuelle, les espacements, le repli du bloc superadmin et la lisibilité du tableau.
- Ajouter un petit composant de synthèse local si cela évite de répéter le markup, sans introduire de dépendance UI.
- Ne pas modifier les actions serveur, le modèle de données ou les règles de filtrage.
- Ajouter/ajuster les tests de fonctions pures uniquement si un comportement de filtrage change ; la refonte ne change pas ces règles.

## Validation

- Test unitaire existant de `filterUsers` et `buildUsersCsv`.
- `npm run lint`.
- `npx tsc --noEmit`.
- `npm run build`.
- Vérification visuelle locale de `/admin/users` sur desktop et largeur mobile.
