# Roaming — Modifier et supprimer chaque élément

## Objectif
Chaque groupe, profil de forfait, offre et compte possède deux actions textuelles visibles : « Modifier » et « Supprimer ». Conserver la charte vert profond, citron et blanc, les quatre onglets et les contrôles d'accès par organisation.

## Interface retenue
- Groupes : modifier le nom et gérer les zones depuis un panneau prérempli ; supprimer avec le nom du groupe et les dépendances annoncées.
- Catalogue : modifier la durée, les débits et le prix d'un profil ; supprimer un profil inutilisé. Les profils liés à des offres ou accès existants indiquent les éléments à traiter d'abord.
- Offres : modifier le tarif du groupe dans un formulaire prérempli ; suppression explicite, distincte de la pause.
- Comptes : conserver et harmoniser les actions existantes de modification et suppression ; afficher les zones où la modification ou révocation a réussi ou reste à reprendre.
- Exploitation : proposer les mêmes actions sur le groupe et les offres sélectionnés. Cet onglet est une vue des objets précédents, pas un objet à supprimer.
- Confirmation de suppression nommée, annulation accessible, état en cours et résultat lisible. Aucun bouton destructif représenté seulement par une icône.

## Comportement
La modification des prix du catalogue et des offres s'applique aux émissions futures ; les tickets déjà vendus gardent leur prix. Une modification structurelle de profil (durée/débits/nom technique) liée à des accès existants est refusée avec explication : créer un nouveau profil évite de modifier silencieusement des accès vendus.
La suppression d'un groupe portant des comptes nominatifs reste bloquée tant que leur révocation n'est pas confirmée sur les zones. La suppression d'une offre retire sa disponibilité future sans couper les accès émis.
La suppression des comptes retire aussi sessions, cookies et compagnons MAC. Une zone injoignable conserve le compte dans le SaaS avec une relance possible. Examiner le chemin de révocation ayant échoué lors du nettoyage récent avant de le réutiliser.

## Validation
Tests des actions serveur : session, rôle, organisation, validation des champs, conflits et dépendances. Tests de révocation : compte et connexions automatiques effectivement supprimés, échec visible et ligne conservée en cas de zone injoignable. Vérification des panneaux et confirmations sur ordinateur et mobile avec données de démonstration ; aucun compte client créé ou supprimé pendant les tests. Puis commit et déploiement habituel sur le VPS.

## Choix
Actions visibles par ligne recommandées : plus faciles à découvrir que des menus « ⋮ » et moins de navigation qu'une page de gestion séparée. Réutiliser les panneaux existants pour garder une interface cohérente.
