# Hero MikroTik transparent avec relief Three.js

## Objectif

Conserver le Hero et son contenu commercial tels qu'ils sont, tout en donnant
au visuel MikroTik une présence réellement tridimensionnelle : routeur détouré
sur fond alpha, profondeur douce et réseau en mouvement dans une scène WebGL
transparente. Les quatre informations existantes restent dans le DOM et
continuent leur orbite circulaire lisible.

## Décision

Ajouter une scène Three.js légère, isolée dans un composant client
`MikrotikOrbitCanvas`. Elle est décorative (`aria-hidden`) : la photo détourée
reste le sujet central et les cartes de métriques restent du HTML accessible.

Le composant charge la même image publiée sous `/mikrotik/chato.webp` sur un
plan avec alpha. Il crée un éclairage bleu-cyan chaud et crédible, inspiré de
la télémétrie réseau plutôt que d'un effet néon uniforme, dans quatre couches
transparentes :

1. une inclinaison lente, accentuée avec parcimonie par le mouvement du
   pointeur, avec une légère variation d'intensité sur le routeur ;
2. deux anneaux de réseau elliptiques, placés à des profondeurs distinctes et
   partiellement masqués par le routeur pour rendre l'avant et l'arrière de la
   scène perceptibles ;
3. un nuage peu dense de particules réseau, de tailles et vitesses variées,
   qui circule le long des anneaux en laissant une courte traînée lumineuse ;
4. un halo volumétrique doux derrière le routeur, ponctué de brefs signaux de
   liaison, sans grille, texte, ni décor opaque.

Le canvas est transparent, ne reçoit pas les interactions, et ne change ni les
liens, ni le formulaire, ni les statistiques rendues par le serveur.

## Image

Le routeur est d'abord édité en préservant strictement sa forme, ses antennes,
ses détails et son cadrage. L'édition l'isole sur un fond chroma magenta plat,
sans ombre portée, puis une suppression locale du chroma produit un WebP alpha
de remplacement à `public/mikrotik/chato.webp`.

Avant remplacement, la sortie doit avoir quatre canaux, des coins transparents
et aucun halo magenta visible sur les bords. L'ancienne image est suivie par
Git, donc récupérable dans l'historique si nécessaire.

## Adaptation et accessibilité

- Desktop : scène dans la colonne gauche, contenu existant à droite.
- Mobile : contenu commercial d'abord, scène ensuite ; aucun débordement
  horizontal.
- `prefers-reduced-motion` : aucun rendu WebGL animé ni inclinaison au pointeur
  ; l'image et les cartes demeurent visibles dans un état statique.
- Les cartes conservent leur pause au survol et leurs informations textuelles
  dans le DOM.
- Le canvas ne capte ni clic ni focus et est absent de l'arbre d'accessibilité.

## Performance et robustesse

Three.js est chargé dans un composant client uniquement. Le canvas limite son
ratio de pixels à 1,5 et sa densité de particules est bornée, ne rend que
pendant qu'il est visible, arrête sa boucle et libère géométries, matériaux,
texture et renderer au démontage. En cas
d'absence de WebGL, l'image détourée et l'animation CSS existante suffisent :
la landing conserve exactement son contenu utile.

## Vérification

Les tests de landing vérifient la présence du canvas décoratif, le repli pour
mouvement réduit et la conservation de l'orbite HTML. La livraison exécute
tests, typage, lint, build Next.js et une vérification navigateur de la
transparence, de l'ordre desktop/mobile et de l'absence de débordement.
