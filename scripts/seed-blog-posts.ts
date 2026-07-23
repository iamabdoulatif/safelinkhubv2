// Trois articles d'exemple pour le blog public — idempotent : un article
// n'est réinséré que si son slug n'existe pas déjà.
// Usage : node --env-file=.env.local scripts/seed-blog-posts.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema.ts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema });

const posts = [
  {
    slug: "monetiser-hotspot-wifi-mobile-money",
    coverImageUrl: "/blog/mobile-money.svg",
    title: "Monétiser son hotspot Wi-Fi avec le mobile money : le guide complet",
    excerpt:
      "Transformer un routeur MikroTik en source de revenus régulière, c'est possible — voici le modèle économique, les tarifs qui fonctionnent et les erreurs à éviter.",
    // publishedAt échelonnés pour un ordre de liste stable (le plus récent en premier).
    daysAgo: 2,
    content: `Dans de nombreuses villes d'Afrique de l'Ouest et d'ailleurs, la connexion Internet à domicile reste chère, alors que la demande explose. Un hotspot Wi-Fi de quartier, payable par mobile money, répond exactement à ce besoin : l'utilisateur achète un code d'accès pour quelques heures ou quelques jours, sans abonnement ni engagement.

## Le modèle économique en bref

Le principe est simple : vous partagez une connexion fibre ou 4G de qualité via un routeur MikroTik équipé d'un portail captif. Chaque client achète un voucher — un code à usage unique — qui lui ouvre l'accès pour une durée et un débit définis. Avec un forfait fibre à 30 000 FCFA par mois et une cinquantaine de clients réguliers, le point d'équilibre est atteint dès les premières semaines.

## Fixer les bons tarifs

La règle d'or : des tickets d'entrée très accessibles. Un forfait « 1 heure » à 100 FCFA attire les curieux, le forfait « 24 heures » à 500 FCFA devient vite le best-seller, et un forfait hebdomadaire fidélise les habitués. Évitez de multiplier les options : trois à cinq forfaits bien choisis convertissent mieux qu'une grille de quinze lignes.

## Le paiement mobile money change tout

Sans mobile money, il faut vendre les codes en main propre, ce qui limite les ventes aux heures où quelqu'un est présent. En connectant votre portail captif à une passerelle de paiement, le client achète son code seul, à toute heure, directement depuis la page de connexion du Wi-Fi. Vos ventes continuent pendant que vous dormez.

## Les erreurs classiques à éviter

Première erreur : sous-dimensionner la connexion source. Vingt clients simultanés sur une 4G saturée, c'est vingt clients qui ne reviendront pas. Deuxième erreur : négliger le partage de connexion — sans limitation par appareil, un seul acheteur peut faire profiter tout l'immeuble. Troisième erreur : gérer les vouchers à la main dans un cahier ; au-delà de dix clients par jour, c'est ingérable et source de conflits.

## Passer à l'échelle

Une fois le premier site rentable, la tentation est grande d'ouvrir un deuxième point. C'est là qu'une plateforme de gestion centralisée devient indispensable : suivi des ventes par site, création de forfaits à distance, supervision des routeurs sans se déplacer. Votre hotspot de quartier devient un vrai réseau d'accès, avec la comptabilité qui va avec.`,
  },
  {
    slug: "choisir-routeur-mikrotik-hotspot",
    coverImageUrl: "/blog/routeur-mikrotik.svg",
    title: "Quel routeur MikroTik choisir pour votre hotspot en 2026 ?",
    excerpt:
      "hAP ax², RB4011, hEX… le catalogue MikroTik est vaste et les fiches techniques indigestes. Voici comment choisir selon votre nombre d'utilisateurs et votre budget.",
    daysAgo: 6,
    content: `MikroTik s'est imposé comme la référence des hotspots commerciaux pour une raison simple : RouterOS embarque nativement tout ce qu'il faut — portail captif, gestion d'utilisateurs, limitation de débit — sans licence supplémentaire. Reste à choisir le bon matériel.

## Les critères qui comptent vraiment

Trois chiffres déterminent votre choix : le nombre d'utilisateurs simultanés visé, le débit de votre connexion source et votre budget. Le processeur du routeur est le facteur limitant : chaque client connecté au portail captif consomme du CPU, surtout si vous activez la limitation de débit par utilisateur.

## Moins de 30 utilisateurs : le hAP ax²

Pour un premier site — un café, une boutique, une cour commune — le hAP ax² est le choix évident. Wi-Fi 6 intégré, quatre cœurs ARM, il gère confortablement une trentaine de clients simultanés avec limitation de débit. Son prix contenu en fait la porte d'entrée idéale : si le site ne décolle pas, l'investissement perdu reste minime.

## De 30 à 100 utilisateurs : le RB4011

Le RB4011 est le cheval de trait des hotspots de quartier. Son processeur quatre cœurs encaisse une centaine de sessions actives, et ses dix ports Gigabit permettent de raccorder plusieurs points d'accès externes pour couvrir une zone plus large. C'est la configuration classique : le RB4011 en cœur de réseau, des antennes déportées dans les zones de chalandise.

## Au-delà : penser architecture, pas boîtier

Passé cent utilisateurs simultanés, la question n'est plus « quel routeur » mais « quelle architecture ». Un CCR (Cloud Core Router) en central, des points d'accès dédiés pour la radio, et une segmentation propre du réseau. À ce stade, le Wi-Fi intégré des routeurs ne suffit plus : les puces radio des équipements tout-en-un ne sont pas conçues pour des dizaines de clients chacune.

## L'erreur à ne pas commettre

Ne choisissez jamais un routeur sur son débit théorique en façade. Un « 1 Gbps » annoncé s'effondre à 200 Mbps dès qu'on active portail captif, files d'attente et pare-feu. Consultez les tests de MikroTik en configuration « 25 % firewall rules » — c'est le chiffre le plus proche de la réalité d'un hotspot.

## Et après l'achat ?

Le matériel n'est que la moitié du travail. La configuration du portail captif, des profils de vitesse et de la facturation prend des heures en ligne de commande. C'est précisément ce que SafeLinkHub automatise : branchez le routeur, lancez l'auto-configuration, et votre hotspot est prêt à vendre en quelques minutes.`,
  },
  {
    slug: "securiser-wifi-public-bonnes-pratiques",
    coverImageUrl: "/blog/securite-wifi.svg",
    title: "Sécuriser un Wi-Fi public : 7 bonnes pratiques pour les opérateurs de hotspot",
    excerpt:
      "Un hotspot mal sécurisé met en danger vos clients et votre activité. Isolation des clients, mots de passe, mises à jour : le tour des mesures indispensables.",
    daysAgo: 12,
    content: `Ouvrir son réseau au public, c'est accepter que des inconnus s'y connectent chaque jour. Sans précautions, un hotspot devient vite un terrain de jeu pour les indélicats — au détriment de vos clients, et de votre réputation. Voici les sept mesures que tout opérateur devrait appliquer.

## 1. Isoler les clients entre eux

C'est la mesure la plus importante et la plus souvent oubliée. Par défaut, deux appareils connectés au même Wi-Fi peuvent se voir et communiquer. L'isolation client (« client isolation ») empêche un utilisateur malveillant de scanner les téléphones de vos autres clients. Sur RouterOS, cela se configure au niveau du bridge et du point d'accès.

## 2. Changer tous les mots de passe par défaut

Le mot de passe « admin » d'usine est la première chose qu'un attaquant essaie. Cela vaut pour l'interface d'administration du routeur, mais aussi pour les services annexes : accès Winbox, SSH, interface web. Utilisez des mots de passe longs et uniques, stockés dans un gestionnaire.

## 3. Ne jamais exposer l'administration sur le réseau public

L'interface d'administration du routeur ne doit être accessible ni depuis le Wi-Fi public, ni depuis Internet. Restreignez Winbox, SSH et l'interface web à une plage d'adresses de gestion dédiée. Si vous devez administrer à distance, passez par un VPN — jamais par une redirection de port ouverte à tous.

## 4. Maintenir RouterOS à jour

Les vulnérabilités de RouterOS sont documentées publiquement et exploitées massivement — des dizaines de milliers de routeurs MikroTik compromis servent aujourd'hui de relais à des botnets. Une mise à jour trimestrielle est un minimum ; activez les canaux stables et planifiez la mise à jour hors des heures d'affluence.

## 5. Limiter le partage de connexion

Un voucher acheté pour un téléphone qui alimente en réalité tout un immeuble, c'est un manque à gagner et une charge imprévue sur le réseau. La limitation à un appareil par code, combinée à la détection de partage de connexion, protège votre modèle économique.

## 6. Journaliser les connexions

En cas d'usage illicite de votre connexion, vous devrez pouvoir montrer qui était connecté et quand. Conservez les journaux d'association et d'authentification du portail captif pendant la durée légale en vigueur dans votre pays. C'est aussi un outil précieux pour diagnostiquer les problèmes de qualité.

## 7. Superviser en continu

Un routeur qui chauffe, une utilisation CPU anormale, un nombre de connexions inhabituel à trois heures du matin : ce sont des signaux d'alerte. Une supervision centralisée — état du routeur, utilisateurs actifs, charge — vous permet de réagir avant que le problème ne devienne une panne ou un incident de sécurité.

## En résumé

La sécurité d'un hotspot n'est pas un projet ponctuel mais une hygiène de fonctionnement. La bonne nouvelle : une fois ces sept pratiques en place, l'essentiel se maintient tout seul, surtout si votre plateforme de gestion applique ces réglages automatiquement à chaque nouveau routeur.`,
  },
  {
    slug: "portail-captif-augmenter-conversions",
    coverImageUrl: "/blog/portail-captif.svg",
    title: "Portail captif : 5 réglages qui font vraiment vendre plus",
    excerpt:
      "La page de connexion de votre hotspot est votre vitrine et votre caisse. Cinq ajustements concrets — testés sur le terrain — pour transformer plus de visiteurs en acheteurs.",
    daysAgo: 4,
    content: `Chaque personne qui se connecte à votre Wi-Fi passe par le portail captif. C'est le seul écran que 100 % de vos clients potentiels verront — et pourtant, la plupart des opérateurs le laissent tel quel, avec un formulaire brut et zéro argument de vente. Voici cinq réglages qui changent les chiffres.

## 1. Annoncez les prix avant de demander un code

Un visiteur qui découvre votre portail ne sait ni ce que coûte l'accès, ni où l'acheter. S'il doit chercher, il abandonne. Affichez la grille des forfaits directement sur la page de connexion : « 1 h — 100 F · 24 h — 500 F · 7 jours — 2 000 F ». Le passant comprend l'offre en trois secondes.

## 2. Indiquez où acheter, avec un vrai contact

Si vos codes se vendent en boutique ou via des vendeurs, mettez leurs noms, quartiers et numéros WhatsApp sur le portail. Un bouton « Acheter un code » qui ouvre une conversation WhatsApp transforme le portail en canal de vente, même sans paiement en ligne.

## 3. Adaptez la page à votre clientèle

Un portail en français à Abidjan, oui — mais si votre zone est anglophone ou bilingue, proposez les deux. Et surtout, restez lisible : un fond photo chargé avec du texte blanc fin est illisible sur un téléphone d'entrée de gamme en plein soleil. Contraste fort, boutons larges, polices grandes.

## 4. Activez le paiement mobile money intégré

Le taux de conversion explose quand l'achat se fait sans quitter la page : le client choisit un forfait, saisit son numéro mobile money, valide sur son téléphone et reçoit son code instantanément. Plus besoin d'attendre l'ouverture de la boutique — les ventes de nuit et du dimanche sont souvent celles qu'on perdait.

## 5. Testez depuis un vrai téléphone client

Ouvrez votre portail depuis un smartphone bas de gamme, en 3G, écran fissuré si possible. C'est l'expérience réelle de votre clientèle. Si la page met plus de trois secondes à s'afficher, allégez les images ; si un bouton est trop petit pour un pouce, agrandissez-le.

## Mesurer, puis itérer

Un portail n'est jamais « terminé ». Comparez chaque semaine le nombre de connexions au portail et le nombre de codes utilisés : l'écart entre les deux, c'est votre marge de progression. Modifiez un seul élément à la fois et observez l'effet sur sept jours.`,
  },
  {
    slug: "starlink-mikrotik-hotspot-rural",
    coverImageUrl: "/blog/starlink-rural.svg",
    title: "Starlink + MikroTik : monter un hotspot rentable là où la fibre n'arrive pas",
    excerpt:
      "Dans les zones rurales sans fibre ni 4G stable, l'internet par satellite change la donne. Architecture, dimensionnement et rentabilité d'un hotspot Starlink partagé.",
    daysAgo: 9,
    content: `Des milliers de localités n'ont ni fibre, ni 4G digne de ce nom — mais une demande énorme de connectivité. L'internet par satellite en orbite basse, Starlink en tête, permet aujourd'hui d'y monter un hotspot communautaire rentable. À condition de bien penser l'installation.

## Le principe : un abonnement, tout un village

Un kit satellite unique fournit 50 à 200 Mbps selon la zone et l'heure. Partagé via un routeur MikroTik et quelques points d'accès bien placés, il peut servir des dizaines de clients simultanés. L'abonnement mensuel se rentabilise dès 40 à 60 clients réguliers à des tarifs accessibles — un seuil atteignable dans la plupart des gros villages et petites villes.

## L'architecture qui fonctionne

Le kit satellite fait uniquement office de source Internet : désactivez son Wi-Fi intégré et placez le routeur MikroTik derrière, en mode routeur principal. C'est lui qui gère le portail captif, les vouchers, la limitation de débit par client et la comptabilité. Ajoutez des points d'accès extérieurs pour couvrir la place du marché, les commerces, la gare routière — les lieux où les gens attendent.

## Dimensionner les forfaits pour une capacité limitée

Contrairement à la fibre, la capacité satellite est précieuse. Limitez le débit par utilisateur (2 à 5 Mbps suffisent pour les réseaux sociaux et la vidéo en qualité normale) et privilégiez les forfaits à durée courte plutôt que l'illimité. Sans limitation par appareil, trois gros téléchargeurs peuvent saturer la liaison pour tout le monde.

## L'alimentation électrique, le vrai défi

En zone rurale, les coupures sont la norme. Prévoyez une batterie avec onduleur pour le kit satellite et le routeur : quatre à six heures d'autonomie couvrent la plupart des coupures. Un hotspot qui tombe à chaque délestage perd vite sa clientèle — la fiabilité est votre premier argument commercial.

## La supervision à distance n'est plus optionnelle

Quand le site est à trois heures de route, impossible de passer « voir si ça marche ». Une plateforme de supervision centralisée — état du routeur, clients connectés, ventes du jour — permet de gérer plusieurs sites ruraux depuis la ville, et de n'envoyer un technicien que quand c'est vraiment nécessaire.

## Ce qu'il faut retenir

Le triptyque gagnant en zone rurale : une source satellite stable, un MikroTik qui monétise, et une supervision à distance. Le tout s'installe en une journée et peut devenir l'infrastructure numérique d'une localité entière.`,
  },
  {
    slug: "gerer-agents-vendeurs-commissions",
    coverImageUrl: "/blog/agents-ventes.svg",
    title: "Vendeurs et agents : structurer la revente de vos codes Wi-Fi sans perdre le contrôle",
    excerpt:
      "Déléguer la vente des vouchers multiplie vos points de distribution — et les risques de coulage. Commissions, suivi des ventes, bonnes pratiques : le mode d'emploi.",
    daysAgo: 15,
    content: `Votre hotspot tourne, les codes se vendent — mais vous ne pouvez pas être partout. La boutique du coin, le kiosque téléphonique, le gérant du maquis : autant de points de vente potentiels pour vos vouchers. Bien structuré, un réseau d'agents démultiplie vos revenus. Mal géré, c'est la porte ouverte au coulage.

## Pourquoi déléguer la vente

Un client achète un code au moment où il en a besoin, à l'endroit où il se trouve. Chaque point de vente supplémentaire capte des clients que vous n'auriez jamais vus. Les vendeurs y trouvent leur compte : une commission sur chaque code vendu, sans investissement ni stock périssable.

## Le modèle de commission qui marche

La pratique courante : 10 à 15 % du prix de vente pour l'agent. En dessous, personne ne se donne la peine de vendre ; au-dessus, votre marge fond. Définissez la commission par forfait dès la création du forfait — un montant fixe par code vendu est plus simple à comprendre et à vérifier qu'un pourcentage.

## Le piège du carnet de codes papier

Distribuer des lots de codes imprimés à ses vendeurs semble simple, jusqu'au premier litige : codes « perdus », déjà utilisés, revendus à double… Sans traçabilité, impossible de savoir qui dit vrai. Chaque code doit être rattaché à l'agent qui l'a reçu, avec son statut en temps réel : provisionné, vendu, utilisé, expiré.

## Un compte par agent, des ventes tracées

La bonne pratique : chaque vendeur dispose de son propre accès (un rôle « agent », sans accès à votre administration) depuis lequel il vend ses codes. Chaque vente est horodatée et rattachée à son compte : vous voyez qui vend combien, les commissions se calculent toutes seules, et le règlement de fin de semaine se fait sur des chiffres que personne ne conteste.

## Payer les commissions sans friction

Fixez un rythme court et régulier — hebdomadaire de préférence. Un agent payé vite et juste reste motivé ; un agent qui attend son dû depuis trois semaines arrête de vendre, ou pire, se sert sur la caisse. Le mobile money rend le versement instantané et traçable.

## Faire grandir le réseau

Commencez avec deux ou trois vendeurs fiables et des zones bien définies pour éviter qu'ils se cannibalisent. Suivez le ratio codes vendus / codes distribués par agent : c'est votre meilleur indicateur pour décider qui mérite plus de stock, et où ouvrir le prochain point de vente.`,
  },
];

async function main() {
  for (const post of posts) {
    const [existing] = await db
      .select({ id: schema.blogPosts.id })
      .from(schema.blogPosts)
      .where(eq(schema.blogPosts.slug, post.slug))
      .limit(1);

    if (existing) {
      console.log(`Déjà présent, ignoré : ${post.slug}`);
      continue;
    }

    const publishedAt = new Date(Date.now() - post.daysAgo * 24 * 60 * 60 * 1000);
    await db.insert(schema.blogPosts).values({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      coverImageUrl: post.coverImageUrl,
      published: true,
      publishedAt,
    });
    console.log(`Article créé : ${post.title}`);
  }
}

main().then(() => process.exit(0));
