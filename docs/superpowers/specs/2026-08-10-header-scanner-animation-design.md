# Animation « cadre scanner » du header

## Objectif

Renforcer le retour visuel des menus de `LandingNav` sans sortir du langage Bitume : aplats opaques, bordures nettes, moutarde comme accent actif, aucun dégradé ni ombre diffuse.

## Périmètre

- Les cinq liens de navigation desktop : Fonctionnalités, Plateforme, Boutique, Blog et Contact.
- Le panneau de navigation mobile lors de son ouverture, avec une apparition séquencée mais courte de ses entrées.
- Les états souris, clavier et préférences de mouvement réduit.

Les boutons Connexion, Commencer et Dashboard conservent leurs traitements actuels ; ils sont déjà visuellement hiérarchisés comme des actions, non comme des liens de navigation.

## Interaction retenue

### Desktop — cadre scanner

Chaque lien reçoit un pseudo-élément de bordure moutarde. Au survol ou au focus clavier, le cadre apparaît en deux temps courts, avec une légère translation verticale du libellé. La transition dure au plus 160 ms et utilise une courbe d'arrêt nette. À la sortie, le cadre disparaît sans flash ni changement de mise en page.

La destination courante recevra le même repère visuel statique lorsqu'elle est identifiable sans ambiguïté. Les ancres de la page d'accueil restent indépendantes de la position de défilement afin d'éviter un état actif trompeur.

### Mobile — panneau

À l'ouverture, le panneau opaque conserve son placement actuel sous le header. Il reçoit une entrée verticale courte ; ses liens s'affichent dans l'ordre avec un décalage minimal. Aucun déplacement de la page ni blocage du focus n'est introduit. La fermeture garde le comportement immédiat actuel pour ne pas retarder la navigation.

### Accessibilité et repli

- `:focus-visible` affiche le même cadre, avec un contraste suffisant sans dépendre de la couleur seule.
- Sous `prefers-reduced-motion: reduce`, les translations et animations sont supprimées. Le cadre reste présent instantanément au survol ou au focus.
- Les cibles, libellés, attributs ARIA et liens existants ne changent pas.

## Implémentation

La modification se limite à `src/components/landing/LandingNav.tsx` et à des classes CSS ciblées dans `src/app/globals.css`. Aucun état réseau, aucune API, aucune dépendance supplémentaire et aucune modification des routes n'est nécessaire.

## Vérification

1. Vérifier sur desktop le survol, le focus clavier et la navigation des cinq liens.
2. Vérifier à 390 px l'ouverture du menu, l'apparition des liens et leur utilisation au clavier.
3. Vérifier le repli `prefers-reduced-motion` et l'absence de débordement du header.
4. Exécuter le contrôle de types, les tests existants et la compilation de production avant le déploiement.
