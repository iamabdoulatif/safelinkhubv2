# Animation progressive des graphiques du dashboard

## Objectif

Au chargement du tableau de bord, les histogrammes et courbes doivent révéler leurs données progressivement afin de rendre la lecture plus naturelle, sans modifier les valeurs, les axes ou la structure des cartes.

## Design retenu

- Les barres de `BarChart` partent visuellement de zéro et montent jusqu'à leur hauteur finale.
- Chaque barre reçoit un court décalage calculé à partir de son index, pour une progression de gauche à droite.
- Les polylignes de `LineChart` utilisent un tracé SVG progressif, avec un décalage léger entre les séries.
- Les surfaces et axes restent visibles immédiatement : seule la donnée est animée.
- Les graphiques vides conservent leur message actuel et ne déclenchent aucune animation.
- La règle globale `prefers-reduced-motion: reduce` neutralise automatiquement l'effet.

## Contraintes

- CSS/SVG natif uniquement ; aucune dépendance supplémentaire.
- Le rendu doit rester stable pendant l'animation pour éviter les décalages de mise en page.
- Les informations accessibles existantes (ARIA et tableau de secours) restent inchangées.
- Le comportement est couvert par des tests statiques ciblant les marqueurs d'animation et la présence du support reduced-motion.
