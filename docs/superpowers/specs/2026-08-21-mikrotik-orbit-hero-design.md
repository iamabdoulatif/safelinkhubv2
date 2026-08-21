# Hero MikroTik en orbite — conception

## Objectif

Faire du hero de la landing SafeLinkHub une scène produit mémorable : un vrai
MikroTik Chateau Pro au centre de la composition, avec quatre faits produit
lisibles qui l'entourent en profondeur. La référence vidéo apporte le rythme
des objets qui traversent un plan éditorial ; elle n'est pas reproduite à
l'identique.

## Direction retenue

**Orbites éditoriales.** Le texte principal, la capture e-mail, les CTA, le
lien de démonstration et la bande de compatibilité conservent exactement leur
emplacement, leur contenu et leur comportement actuels. Seul le décor déjà
prévu autour de ces éléments est remplacé par la scène MikroTik, afin que la
promesse commerciale et l'objet réel se répondent sans modifier le parcours
existant.

L'image utilisée est `public/mikrotik/chato.webp`. Elle reste une photo réelle
du routeur : l'impression 3D est obtenue par le cadrage, une rotation CSS très
légère, le socle, les ombres directionnelles et les calques de premier plan —
jamais par une image synthétique ou une déformation de l'équipement.

## Composition desktop

- Une scène claire à grille discrète isole le routeur du reste de la page.
- Une flaque d'ombre elliptique, un socle sombre et quelques LED renforcent la
  profondeur de l'objet.
- Quatre plaques de verre chaud, légèrement transparentes, sont placées à des
  profondeurs différentes autour du routeur :
  - **Routeurs supervisés** — `parc total sur la plateforme` ; valeur réelle
    seulement si la base répond.
  - **Sessions en cours** — `sur les routeurs joignables` ; valeur réelle
    seulement si la base répond.
  - **Essai offert** — `${VPN_TRIAL_DAYS} jours, sans carte bancaire`.
  - **Mobile Money** — opérateurs réellement configurés dans la plateforme.
- Les plaques ne couvrent ni le visage du routeur ni le CTA. Elles ont un fond
  translucide, une bordure fine et un contraste de texte suffisant sur le fond
  clair.

## Mouvement et interaction

- Les quatre plaques suivent une dérive orbitale lente et décalée (environ
  24–32 secondes), plutôt qu'une rotation mécanique constante.
- Le routeur avance de quelques pixels puis revient, avec une micro-variation
  de perspective ; la scène reste calme et ne détourne pas la lecture.
- Le survol d'une plaque suspend son mouvement et augmente légèrement son
  opacité. Rien ne dépend de l'animation pour être compris.
- `prefers-reduced-motion: reduce` désactive toutes les boucles et affiche une
  composition fixe entièrement lisible.

## Mobile et accessibilité

- Sous le breakpoint desktop, texte et CTA passent avant la scène.
- Les plaques cessent d'être absolues : elles deviennent une grille de deux
  colonnes placée sous le MikroTik afin d'éviter tout recouvrement ou texte
  coupé.
- Les valeurs présentées dans les plaques restent dans le flux sémantique ; les
  décors (socle, orbites, lueurs) sont exclus des lecteurs d'écran.
- L'image reçoit un texte alternatif descriptif et une taille intrinsèque pour
  éviter le décalage de mise en page.

## Portée et validation

- Modification ciblée : `Hero.tsx`, styles de la landing et ajout de
  `public/mikrotik/chato.webp` au dépôt suivi. Tous les autres éléments du
  hero restent intacts.
- Aucune donnée, route API, authentification ou logique de facturation ne
  change.
- Tests : contrat de rendu du hero, build Next.js, contrôle visuel desktop et
  mobile avec animation réduite.

## Auto-revue

- Aucun placeholder ou choix non tranché.
- Les chiffres conservent la règle existante : aucune valeur fictive si la base
  ne répond pas.
- La scène reste indépendante des composants d'inscription et de statistiques,
  qui conservent leurs contrats actuels.
