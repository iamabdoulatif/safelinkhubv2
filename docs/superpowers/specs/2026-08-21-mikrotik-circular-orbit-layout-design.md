# Hero MikroTik — orbite circulaire et composition en deux colonnes

## But

Faire ressembler la scène du hero à la référence vidéo validée : le Château Pro
reste le point fixe, tandis que les quatre plaques de faits produit parcourent
une orbite circulaire continue autour de lui. Sur écran large, la scène passe à
gauche et le message commercial existant passe à droite.

## Composition validée

### Écran large

- Une grille à deux colonnes est activée à partir de 1024 px : scène à gauche,
  contenu commercial à droite.
- Le contenu commercial est conservé mot pour mot et garde son formulaire, son
  CTA secondaire et le bandeau de constructeurs. Seule son positionnement
  change ; il est aligné à gauche dans sa colonne droite.
- La scène ne reçoit ni carte, ni aplât, ni halo de fond. Le fond du hero reste
  visible au travers ; la photo `chato.webp` emploie son mélange existant pour
  ne pas former de carré opaque.
- Le routeur conserve son angle en légère perspective, son ombre portée et sa
  taille réelle. Il reste immobile à l’échelle de la page, sans masquer le
  formulaire.

### Orbite B

- `Routeurs supervisés`, `Sessions en cours`, `Essai offert` et `Mobile money`
  sont quatre objets indépendants mais synchronisés sur une même boucle de 38
  secondes. Chacun reçoit un décalage de 25 % de période afin qu’ils soient
  toujours répartis autour du routeur.
- Une paire de conteneurs par plaque réalise le mouvement : le conteneur externe
  tourne autour du centre ; le contenu interne contre-tourne exactement au même
  rythme. Les textes restent donc horizontaux et lisibles, même en bas de
  l’orbite.
- L’échelle, l’opacité, la bordure et l’ombre évoluent durant le trajet : la
  plaque qui passe au premier plan est nette et pleine taille ; celle qui passe
  derrière le routeur est légèrement réduite et adoucie. La profondeur vient de
  ce rythme, pas d’un décor ajouté ou d’une animation JavaScript.
- Le tracé de l’orbite est une ligne fine et discrète, uniquement indicative.
  Il ne crée pas de fond et disparaît en mouvement réduit.

### Écrans étroits et accessibilité

- Sous 1024 px, le texte reste premier dans le flux, centré comme aujourd’hui,
  puis la scène est rendue dessous. Cela maintient la lecture et le formulaire
  avant toute animation.
- Sous 640 px, les plaques cessent d’être absolues et forment une grille de
  lecture en deux colonnes sous le routeur.
- `prefers-reduced-motion: reduce` enlève toute rotation et tout déplacement.
  Le routeur reste visible et les quatre plaques redeviennent une grille dans
  l’ordre éditorial, sans contenu caché.

## Structure technique

- `src/components/landing/Hero.tsx` : conserver `OrbitMetric` et les sources
  honnêtes des chiffres ; introduire seulement les enveloppes d’orbite et un
  wrapper de grille du hero. Aucune donnée, action serveur ni dépendance cliente
  n’est ajoutée.
- `src/app/globals.css` : remplacer les dérives indépendantes existantes par
  l’orbite circulaire, la contre-rotation, les états de profondeur et les
  breakpoints de disposition. Les sélecteurs restent préfixés
  `.hero-orbit-` / `.hero-layout`.
- `test/landing-mikrotik-hero.test.mjs` : étendre le contrat avec la structure
  d’orbite, la boucle de 38 secondes, la contre-rotation, la colonne droite et
  le repli sans mouvement. Les assertions existantes sur l’actif, les textes et
  le formulaire restent intactes.

## Critères d’acceptation

1. À partir de 1024 px, le MikroTik est dans la colonne gauche et le texte,
   l’adresse e-mail et les CTA dans la colonne droite.
2. Les quatre plaques font une rotation circulaire continue de 38 secondes
   autour du MikroTik ; chaque texte reste droit.
3. Le hero et la scène MikroTik n’ajoutent aucun fond opaque derrière l’image.
4. Le responsive conserve le texte et le formulaire avant la scène sur mobile.
5. Le mouvement réduit présente tous les contenus sans animation.
6. Les chiffres restent issus de `PlatformStats` et aucune valeur factice n’est
   introduite.
