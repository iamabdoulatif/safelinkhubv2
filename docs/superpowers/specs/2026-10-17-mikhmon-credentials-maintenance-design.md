# Design — Restauration du mot de passe MikHmon depuis Maintenance

## Objectif

Permettre à tous les utilisateurs autorisés à gérer un routeur de restaurer
automatiquement le mot de passe MikHmon par défaut `1234`, lorsque l'accès est
perdu ou inconnu. L'action doit être compréhensible, confirmée et cohérente
avec la charte SafeLinkHub existante.

## Choix UX validé : variante C

Dans le menu « Maintenance », l'entrée « Identifiants MikHmon » ouvre un
panneau dédié plutôt que d'exécuter immédiatement une opération sensible.
Le panneau présente :

1. l'état de l'accès MikHmon : configuré, synchronisé ou indisponible ;
2. l'identifiant `mikhmon` ;
3. le mot de passe actuel masqué, avec affichage contrôlé si nécessaire ;
4. un bloc séparé « Réinitialisation d'urgence » ;
5. un bouton secondaire rouge « Restaurer le mot de passe 1234 ».

Le rouge reste limité à cette action sensible, conformément aux boutons
destructifs déjà utilisés dans l'interface.

## Confirmation

Au clic, une boîte de dialogue demande confirmation avec un texte explicite :

> Le mot de passe MikHmon sera remplacé par `1234` sur ce routeur. Cette
> valeur est connue et peu sécurisée. Voulez-vous continuer ?

Les boutons sont « Annuler » et « Restaurer 1234 ». L'action est désactivée
pendant l'exécution et un état de progression est visible.

Après succès, le panneau affiche une confirmation et rappelle :

> Mot de passe restauré : `1234`. Pensez à le modifier après récupération de
> l'accès.

## Comportement serveur

Une action serveur dédiée vérifie la session et l'appartenance du routeur à
l'organisation de l'utilisateur, puis :

1. se connecte au routeur ;
2. vérifie que le conteneur MikHmon existe ;
3. réécrit la session MikHmon avec le compte `mikhmon` et le mot de passe
   chiffré correspondant à `1234` ;
4. enregistre cette valeur dans `mikhmon_admin_password_encrypted` afin que
   l'action « Identifiants MikHmon » affiche une information cohérente ;
5. renvoie un résumé exploitable par l'interface.

L'opération ne réinstalle pas le conteneur et ne modifie pas les règles réseau.
Si le routeur est hors ligne ou si le conteneur est absent, l'interface affiche
une erreur actionnable sans modifier la valeur enregistrée.

## Charte visuelle et responsive

- Utiliser les tokens existants `paper`, `clay`, `ink`, `ink-soft`, `line`,
  `brand`, `brand-deep`, `err` et `err-soft`.
- Reprendre les rayons, espacements, ombres et boutons déjà présents dans la
  fiche routeur.
- Garder le panneau lisible sur mobile : une seule colonne, bouton principal
  pleine largeur sous 640 px.
- Ajouter les attributs d'accessibilité `role="dialog"`, `aria-modal`, un
  titre associé et un retour du focus vers l'entrée « Identifiants MikHmon ».

## Critères d'acceptation

- Tous les utilisateurs pouvant gérer le routeur voient l'action.
- Un simple clic dans le menu ne réinitialise jamais le mot de passe.
- Après confirmation et routeur en ligne, MikHmon accepte `mikhmon / 1234`.
- L'action fonctionne aussi si le mot de passe précédent était inconnu.
- Une erreur réseau ne remplace pas le mot de passe enregistré.
- Les tests couvrent l'autorisation, le succès, le routeur hors ligne et le
  conteneur absent.
