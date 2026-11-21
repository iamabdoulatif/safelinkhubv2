# SafeLinkHub Brand Guide

> Marque publique : **SafeLinkHub**. « Xenfi » est le nom du dépôt / de l'entité,
> il n'apparaît nulle part dans l'identité visuelle.
>
> Portée : ce document régit le nom, le logo, les couleurs et le ton. Il ne
> remplace pas les deux chartes d'interface déjà en place (voir *Rapport à
> l'existant*).

## Product Name

**SafeLinkHub**

Une plateforme SaaS qui relie l'infrastructure réseau, la vente d'accès Internet
et les revenus d'un opérateur dans un même centre de contrôle.

Le nom s'écrit en un seul mot, trois capitales internes : `SafeLinkHub`.
Jamais « Safelinkhub », « Safe Link Hub », « SLH » en texte courant, ni traduit.
Le composant de logo porte déjà `translate="no"` — cette règle est technique
autant qu'éditoriale.

Ce que le produit fait réellement, tel qu'il est construit aujourd'hui :

- connexion et pilotage de routeurs, MikroTik en premier ;
- auto-setup et provisionnement Hotspot / PPPoE (un seul script d'installation) ;
- noyau RADIUS cloud ;
- vouchers Wi-Fi, forfaits, sessions, portails captifs ;
- paiements Mobile Money (Wave, Orange Money, MTN MoMo, Moov), cartes, virements ;
- agents de vente et points de vente ;
- suivi des ventes, transactions, dépenses, solde flottant et revenus ;
- supervision : uptime, CPU, mémoire, utilisateurs actifs, alertes ;
- accès distant sécurisé (VPN, WireGuard, OpenVPN) ;
- roaming entre plusieurs routeurs et sites ;
- compatibilité MikroTik, Ruijie Reyee, TP-Link, Ubiquiti UniFi, Cambium
  Networks, Cisco, D-Link, Huawei ;
- **Safecoin**, crédit interne de services — ce n'est pas une cryptomonnaie, et
  cela ne doit jamais être suggéré visuellement.

## Audience

- Gérants de hotspots Wi-Fi
- Opérateurs WISP et FAI de petite ou moyenne taille
- Intégrateurs réseau
- Revendeurs et agents de vente Internet
- Équipes techniques qui administrent des routeurs multi-sites
- Entreprises opérant en Afrique francophone, où le Mobile Money et les
  paiements terrain sont essentiels

Le public attend un produit fiable, simple à exploiter et crédible
techniquement. Il ne recherche ni un outil grand public, ni une marque crypto,
ni un logiciel de cybersécurité abstrait.

Conséquence concrète : le logo sera vu **plus souvent sur un écran de téléphone
d'agent, dans un portail captif, sur un ticket de voucher imprimé et dans un
onglet de navigateur** que sur une page produit en grand format. La lisibilité à
petite taille et en monochrome prime sur la richesse du signe.

## Personality

SafeLinkHub doit évoquer :

- Le contrôle
- La fiabilité
- La connexion
- La clarté opérationnelle
- La croissance des revenus
- La proximité terrain
- La rigueur technique
- La simplicité malgré la complexité réseau
- La confiance
- L'évolutivité multi-sites

Le ton est direct, compétent et accessible. SafeLinkHub est un centre de
pilotage, pas une marque de luxe ni un outil technique intimidant. La voix
produit existante en donne la mesure : « Fini la création manuelle des
utilisateurs PPPoE », « Le réseau commence ici. » — phrases courtes, bénéfice
d'abord, aucun jargon gratuit.

## Visual References

S'inspirer de :

- Topologies réseau simples et lisibles
- Flux de données qui relient plusieurs points
- Centres de contrôle SaaS B2B
- Interfaces de monitoring et de facturation fiables
- Signaux, nœuds, routes, connexions et circulation maîtrisée
- Matériel réseau sobre : routeurs, antennes, liens, ports et statuts
- Une esthétique technique contemporaine, nette et structurée
- Des marques SaaS infrastructurelles qui privilégient la confiance, la
  lisibilité et la robustesse

Le logo doit pouvoir représenter simultanément :

- **Safe** : confiance et continuité de service ;
- **Link** : liaison entre réseau, clients, paiements et équipes ;
- **Hub** : point de contrôle central pour plusieurs sites.

Hiérarchie de lecture recommandée : **Hub d'abord** (le centre), **Link ensuite**
(ce qui en part), **Safe en dernier** (porté par la stabilité de la construction,
jamais par un cadenas).

## Colors

| Rôle | Valeur | Usage |
| --- | --- | --- |
| Primaire (lime) | `#D6F344` | Accent, point actif, lien, signal, détail de marque |
| Encre | `#151515` | Texte, tracé du symbole, aplat sombre |
| Fond clair | `#FFFFFF` | Fond principal |
| Surface secondaire | `#F6F7F4` | Cartes, bandes alternées |
| Gris structurel | `#E5E7E1` | Séparateurs, bordures fines |
| Texte secondaire | `#686B65` | Légendes, métadonnées |

Le vert lime `#D6F344` est la signature visuelle de SafeLinkHub. Il fonctionne
avec du texte noir et s'emploie **avec retenue** : accent, point actif,
connexion, signal ou détail de marque.

Règles non négociables :

- **Jamais de texte blanc sur `#D6F344`.** Mesuré, le lime plafonne autour de
  1,3:1 sur blanc — illisible. Sur un aplat lime, le texte est toujours encre.
- **Le lime ne fait pas du texte sur fond clair.** Pour un accent typographique
  sur blanc, utiliser un vert encre foncé (`#3F6212` dans l'implémentation
  actuelle), pas le lime.
- Pas de dégradé, pas de néon, pas de lueur.
- Sur fond lime, le logo passe en monochrome encre.

## Typography Direction

- Wordmark net, contemporain, lisible et compact
- Sans-serif géométrique ou grotesk, avec une légère personnalité technique
- Mono discrète autorisée pour les contextes réseau : adresses IP, MAC,
  identifiants de routeur, métriques
- Éviter les typographies futuristes difficiles à lire, les scripts et les
  formes trop décoratives
- Le mot-symbole « SafeLinkHub » doit rester immédiatement lisible à petite
  taille

Réglages du wordmark : `tracking` légèrement resserré, graisse forte mais pas
noire, capitales internes `S` / `L` / `H` conservées telles quelles — ce sont
elles qui donnent le rythme `Safe·Link·Hub` sans avoir à colorer une syllabe.

## Things to Avoid

- Icône Wi-Fi générique utilisée seule
- Bouclier, cadenas ou coche de sécurité génériques
- Globe terrestre, cloud ou réseau de points trop cliché
- Pièces, billets, crypto-symboles ou références visuelles au trading
- Dégradés, effets 3D, néons, glassmorphism
- Symbole trop détaillé pour une favicon
- Monogramme « S » sans lien clair avec le produit
- Apparence de fintech bancaire, antivirus ou startup crypto
- Copier directement une identité ou un logo existant

À cette liste s'ajoute, propre à SafeLinkHub :

- **Ne pas dessiner un routeur ni une antenne littérale.** Le produit gère huit
  marques de matériel ; représenter une boîte, c'est se ranger derrière une
  seule.
- **Ne pas faire de Safecoin ou du paiement le cœur de l'identité.** Le revenu
  est une conséquence de la plateforme, pas sa promesse principale — et tout
  symbole monétaire rapproche dangereusement de la case crypto.

## Logo Requirements

Livrables attendus dans `public/brand/` :

| Fichier | Contenu |
| --- | --- |
| `safelinkhub-logo.svg` | Logomark + wordmark horizontal, couleur |
| `safelinkhub-mark.svg` | Symbole seul, couleur |
| `safelinkhub-logo-mono.svg` | Version horizontale monochrome noire |
| `safelinkhub-favicon.svg` | Symbole optimisé pour 16 px |

Contraintes :

- lisible à 16 px, 24 px et 32 px ;
- fonctionne sur fond blanc, noir et lime `#D6F344` ;
- peu de formes, peu de détails ;
- `currentColor` partout où c'est possible, pour que la version mono suive la
  couleur du texte parent sans variante supplémentaire ;
- épaisseur de trait minimale ≈ 1/12 de la hauteur du signe, sinon le trait
  disparaît en favicon ;
- zone de respiration : la hauteur de la capitale `S` du wordmark, sur les
  quatre côtés ;
- taille minimale du lockup horizontal : 96 px de large.

## Identité retenue — « Hub Badge »

Le logomark est une **pastille-hub** : un disque plein (le **Hub**, nœud central
dominant) dans lequel le **S routé** — cinq segments orthogonaux, jonctions
arrondies — est creusé en négatif et **sort vers un port actif lime** sur la
jante (le **Link**). La continuité ininterrompue du tracé porte la disponibilité
(**Safe**) — sans jamais dessiner de cadenas.

Hiérarchie de lecture : **Hub d'abord** (le disque), **Link ensuite** (la route
qui rejoint le port), **Safe en dernier** (porté par l'aplomb de la
construction, jamais par un cadenas).

Géométrie de référence, grille 32 × 32 :

```
circle  cx16 cy16 r14.5                      disque — currentColor (encre)
mask    S en trou : path M24 8 H13 V16 H19 V23.2 H7.8
        trait 3.3, linecap/linejoin round
rect    23 3  6×6 r1.6   port d'arrivée — lime (var --slh-accent)
```

Le S n'est pas décoratif, c'est un tracé de routage creusé dans le hub : les
paliers disent le passage par le point central (**Hub**), le port terminal la
liaison vers le site actif (**Link**), la continuité du trait la disponibilité
(**Safe**).

### Mécanique des couleurs

Le disque est en `currentColor` et le **S est un vrai trou** (via `<mask>`),
l'accent (port) en `var(--slh-accent, #D6F344)`. Conséquences :

- **Inliné** dans une page, le disque suit la couleur du texte parent et le S
  laisse voir le fond : disque encre sur le blanc de la nav, disque **blanc** sur
  le vert profond du pied de page, correct sur le papier de `/admin`. Un seul
  signe s'inverse tout seul pour tous les fonds.
- **Sur un aplat lime**, poser `--slh-accent: currentColor` sur un parent, sinon
  le port se fond dans le fond.
- En `<img>`, `currentColor` retombe sur l'encre déclarée dans le fichier : les
  fichiers couleur sont donc réservés aux fonds clairs. Pour un fond sombre,
  inliner le SVG ou utiliser la version mono en la colorant.

### Livrables

| Fichier | Contenu |
| --- | --- |
| `public/brand/safelinkhub-logo.svg` | Lockup horizontal couleur, 168 × 32 |
| `public/brand/safelinkhub-mark.svg` | Symbole seul, 32 × 32 |
| `public/brand/safelinkhub-logo-mono.svg` | Lockup monochrome, tout en `currentColor` |
| `public/brand/safelinkhub-favicon.svg` | Pastille lime pleine, S en encre |

Trois écarts assumés dans ces fichiers :

- **Le wordmark des lockups est du `<text>`, pas des tracés vectorisés.** Aucune
  fonte de marque n'est sous licence dans ce dépôt. La pile déclarée est celle
  que rend l'application ; hors navigateur (impression, partenaire), vectoriser
  le texte au préalable.
- **Le S est un trou de `<mask>`, pas un détourage vectorisé.** C'est ce qui
  garde un seul signe adaptatif (currentColor). Pour un consommateur qui ne gère
  pas les masks, recolorer le blanc du S ou vectoriser le négatif en vrai
  détourage.
- **La favicon n'est pas le symbole standard.** À 16 px un port d'accent ne fait
  plus qu'un pixel : le lime y passe en champ plein (pastille) et porte seul la
  couleur de marque, le S restant en encre. Elle est ainsi lisible sur onglet
  clair comme sombre. `src/app/icon.svg` porte la même pastille.

Piège XML rencontré, à ne pas réintroduire : **un `--` est interdit dans un
commentaire XML**. Un commentaire mentionnant `--font-syne` rendait le fichier
non parsable, et le navigateur affichait simplement une image cassée, sans
erreur. Valider après toute retouche :

```bash
for f in public/brand/*.svg; do python3 -c "import xml.dom.minidom;xml.dom.minidom.parse('$f')" && echo "ok $f" || echo "KO $f"; done
```

## Rapport à l'existant

- Le composant [`src/components/landing/Logo.tsx`](src/components/landing/Logo.tsx)
  **inline** le symbole plutôt que de servir `/brand/safelinkhub-mark.svg` en
  `<img>` : c'est ce qui permet au disque (`currentColor`) et au S (trou de
  `mask`) de s'inverser seuls, et cela évite une requête et un logo qui apparaît
  en retard. C'est un **composant client** (`"use client"` + `useId`) : l'`id`
  du mask doit être unique, le logo étant rendu plusieurs fois par page. La
  géométrie est donc dupliquée entre le composant et le fichier SVG — **toute
  retouche doit être reportée dans les deux**.
- Le composant sert cinq points d'appel :
  [`LandingNav`](src/components/landing/LandingNav.tsx:53),
  [`LandingFooter`](src/components/landing/LandingFooter.tsx:91) (avec `dark`),
  [`AdminSidebar`](src/components/AdminSidebar.tsx:237) (barre mobile et tiroir)
  et le dialogue d'activation MikHmon Cloud.
- **Le surligneur `.marker` a quitté le wordmark.** Il lisait `--brand`, dont la
  valeur change selon la peau — le logo était lime sur la landing et moutarde
  dans `/admin`. L'accent est désormais le port du symbole, en lime fixe : la
  marque a enfin une couleur unique. La classe `.marker` reste en place, elle
  sert ailleurs (Hero, titres éditoriaux).
- **Repli sous 360 px.** Le groupe de droite de la nav fait 162 px et le lockup
  complet 144 px, pour 288 px utiles à 320 px : mesuré, le wordmark seul tenait
  pile et le symbole ajoutait 36 px de trop. Le wordmark passe donc en
  `sr-only` sous 360 px — et non en `hidden`, car le SVG est `aria-hidden` et le
  logo du pied de page n'est enveloppé dans aucun lien porteur d'`aria-label` :
  `hidden` aurait retiré la marque de l'arbre d'accessibilité.

**Deux chartes cohabitent, et le logo les traverse.** Bitume (moutarde `#EAB308`
/ anthracite) sur `/admin` et le portail captif ; Slate (lime / blanc / vert
profond `#12301D`) sur le site public via `.theme-slate`. Le port lime du
symbole est donc, dans `/admin`, une couleur étrangère à la charte locale.
C'est le prix d'une marque à couleur fixe, et c'est le bon prix — mais si la
dissonance gêne, l'alternative est de neutraliser l'accent dans `/admin` via
`--slh-accent`.

**Écart de couleur tranché (27/08/2026).** Le jeton `--brand` de Slate est
réaligné sur `#D6F344` ([`globals.css`](src/app/globals.css)), et les derniers
littéraux `#C8F24E` du code ont suivi — symbole, favicon, dialogue MikHmon.
Il n'y a plus qu'un seul lime dans le produit. Mesuré après coup : `#D6F344`
tient **1,25:1 sur blanc** (contre 1,29:1 pour l'ancien), donc la règle ne
bouge pas d'un pouce — jamais de texte de marque sur fond clair, c'est
`--brand-deep` (7,08:1) qui sert. Le noir `#10160F` posé dessus est à 14,66:1.

**Favicon : fait depuis.** [`src/app/icon.svg`](src/app/icon.svg) porte la
pastille de marque et prime sur `favicon.ico`, que Next.js sert encore aux
clients sans SVG.
