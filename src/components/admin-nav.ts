import {
  Coins,
  CreditCard,
  LayoutDashboard,
  Router,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import type { Capability } from "@/lib/auth/roles";
import type { AdminDictionary } from "@/lib/i18n/admin/fr";

/* La tranche `nav` traverse la frontière serveur/client : elle ne doit donc
 * porter que des chaînes. `pendingBadge` est une fonction d'interpolation —
 * le layout la déroule côté serveur et n'envoie que le texte fini. */
export type NavDict = Omit<AdminDictionary["nav"], "pendingBadge">;

/**
 * Navigation d'administration, GROUPÉE PAR MÉTIER ET REPLIABLE.
 *
 * Les groupes suivent ce que fait l'opérateur, pas l'ordre d'arrivée des
 * fonctionnalités. Le tableau de bord reste seul en tête : c'est la page
 * d'atterrissage, elle n'appartient à aucune catégorie.
 *
 * UN SEUL GROUPE OUVERT À LA FOIS. Tout déplié, la barre comptait jusqu'à
 * trente entrées — donc du défilement, donc des libellés qu'on relit à chaque
 * visite. Repliée, elle tient en un écran : six intitulés de métier, et le
 * détail du seul métier où l'on travaille. Le groupe de la page courante
 * s'ouvre tout seul ; on ne peut pas se retrouver perdu dans une barre fermée.
 *
 * Les ICÔNES ne vivent plus que sur les groupes. Trente icônes empilées ne se
 * distinguaient plus les unes des autres — six, si.
 *
 * Une seule entrée « Paramètres » : la navigation interne du hub (Général,
 * Configuration routeur, Passerelles…) appartient aux onglets SettingsTabs —
 * pas de deuxième système de navigation concurrent dans la sidebar.
 */
/* Les libellés ne vivent plus ici : la structure porte une CLÉ stable, le
 * texte vient du dictionnaire. Renommer une route ne peut donc plus faire
 * perdre sa traduction à une entrée. */
export type NavKey = keyof NavDict["links"];
export type SectionKey = keyof NavDict["sections"];
/* `need` = capacité exigée pour VOIR l'entrée. Absente = visible par tous les
   membres, y compris un Lecteur : ce sont les écrans de consultation. Masquer
   plutôt que laisser cliquer vers un refus — un menu qui mène à « accès
   refusé » apprend à se méfier de tout le menu. */
export type NavLink = { href: string; key: NavKey; need?: Capability };
export type NavGroup = { key: SectionKey; icon: typeof LayoutDashboard; links: NavLink[] };

export const dashboard: NavLink = { href: "/admin", key: "dashboard" };

const businessGroups: NavGroup[] = [
  {
    key: "network",
    icon: Router,
    links: [
      // Pluriel : la page liste le parc, elle n'en configure pas un seul.
      { href: "/admin/router", key: "routers", need: "routers" },
      // Une PAGE, pas une action : repliée le 04/09 dans « Plus d'actions » de
      // la liste des routeurs, elle y est devenue introuvable — « je ne vois
      // plus la restauration ». Elle vit ici, avec les autres pages du réseau.
      { href: "/admin/router/backups", key: "backups", need: "routers" },
      { href: "/admin/remote-access", key: "remoteAccess", need: "routers" },
      { href: "/admin/roaming", key: "roaming", need: "routers" },
      // Casse officielle du produit : MikHmon.
      { href: "/admin/mikhmon-online", key: "mikhmon", need: "routers" },
      // Utilisateurs actifs + routeurs en ligne : de la supervision réseau,
      // pas de l'analyse commerciale (à ne pas confondre avec « Analyse
      // commerciale », côté superadmin — d'où le renommage).
      { href: "/admin/usage-analytics", key: "supervision" },
    ],
  },
  {
    key: "sales",
    icon: Ticket,
    links: [
      { href: "/admin/packages", key: "packages", need: "packages" },
      // « Vouchers » était le seul libellé anglais de la sidebar, alors que la
      // page elle-même s'intitule « Station Tickets » et compte des « tickets ».
      { href: "/admin/vouchers", key: "tickets", need: "tickets" },
      { href: "/admin/agent", key: "agents", need: "tickets" },
      { href: "/admin/sales", key: "sales" },
      // La page est l'entonnoir des commandes du portail captif (combien
      // atteignent le checkout, combien paient). « Conversion paiement »
      // laissait croire à un réglage de moyens de paiement.
      { href: "/admin/conversion", key: "conversion" },
    ],
  },
  {
    key: "finance",
    icon: Coins,
    links: [
      { href: "/admin/transactions", key: "transactions" },
      { href: "/admin/float", key: "float", need: "billing" },
      { href: "/admin/expenses", key: "expenses", need: "billing" },
    ],
  },
  {
    key: "org",
    icon: Users,
    links: [
      { href: "/admin/users", key: "users" },
      { href: "/admin/members", key: "members", need: "members" },
      { href: "/admin/router-transfers", key: "transfers", need: "routers" },
      { href: "/admin/verification", key: "verification" },
      { href: "/admin/settings/general", key: "settings", need: "settings" },
    ],
  },
];

const accountLinks: NavLink[] = [
  { href: "/admin/billing", key: "billing", need: "billing" },
  { href: "/admin/support", key: "support" },
];

// Sections réservées au superadmin — le lien n'est qu'un raccourci visuel,
// chaque page/action vérifie elle-même isSuperAdmin côté serveur.
// Réordonné : ce sur quoi on AGIT d'abord (Autorisations porte un badge de
// demandes en attente — il était en septième position), le contenu éditorial
// ensuite, puisqu'on s'y rend par intention et non par urgence.
const superadminLinks: NavLink[] = [
  { href: "/admin/authorizations", key: "authorizations" },
  { href: "/admin/kyc", key: "kyc" },
  { href: "/admin/vpn-access", key: "vpnAccess" },
  { href: "/admin/analytics", key: "analytics" },
  { href: "/admin/safecoin", key: "safecoin" },
  { href: "/admin/contact", key: "contact" },
  { href: "/admin/testimonials", key: "testimonials" },
  { href: "/admin/blog", key: "blog" },
  { href: "/admin/formations", key: "training" },
  { href: "/admin/marketing", key: "marketing" },
];

/** Quel groupe de la barre latérale est déplié.
 *
 * Par défaut celui de la page courante — une barre entièrement close ne dirait
 * plus où l'on se trouve. Le pli choisi à la main l'emporte, mais seulement
 * TANT QU'ON RESTE sur la même page : dès qu'on navigue, c'est de nouveau la
 * position réelle qui commande, sinon on garderait ouvert un groupe qu'on a
 * quitté pendant que celui où l'on travaille resterait fermé.
 */
export function groupeOuvert<G extends string>({
  groupeActif,
  choix,
  chemin,
}: {
  /** Groupe contenant la page courante, null si aucune (tableau de bord). */
  groupeActif: G | null;
  /** Dernier pli demandé par l'opérateur, avec la page où il l'a demandé. */
  choix: { chemin: string; groupe: G | null } | null;
  chemin: string | null;
}): G | null {
  return choix && choix.chemin === chemin ? choix.groupe : groupeActif;
}

/** Groupes visibles pour ce visiteur (le groupe superadmin n'existe que pour lui). */
export function navGroups(superadmin: boolean): NavGroup[] {
  return [
    ...businessGroups,
    { key: "account", icon: CreditCard, links: accountLinks },
    ...(superadmin ? [{ key: "superadmin" as SectionKey, icon: ShieldCheck, links: superadminLinks }] : []),
  ];
}

/** L'entrée `href` représente-t-elle la page `pathname` ?
 *
 * Par SEGMENT, pas par préfixe de chaîne : « /admin/router » ne doit pas
 * s'allumer sur « /admin/router-transfers » (c'était le cas). */
export function isNavActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  // Le tableau de bord ne s'allume que sur /admin exactement, sinon il
  // resterait actif sur toutes les sous-pages.
  if (href === "/admin") return pathname === "/admin";
  // « Paramètres » pointe vers /admin/settings/general mais représente TOUT le
  // hub : il reste actif sur /admin/settings/gateways, /router-setup…
  if (href.startsWith("/admin/settings")) return under("/admin/settings");
  // « Routeurs » couvre /admin/router/<id> mais pas /admin/router/backups,
  // qui a sa propre entrée.
  if (href === "/admin/router") return under(href) && !under("/admin/router/backups");
  return under(href);
}

/** Fil d'Ariane de la page courante : groupe puis page, lus dans la même
 * structure que la barre latérale. `deeper` = on est SOUS la page (fiche d'un
 * routeur…) : la page devient alors un lien de retour vers sa liste. */
export function navTrail(
  pathname: string | null,
  superadmin: boolean,
): { section: SectionKey | null; link: NavLink; deeper: boolean } | null {
  if (isNavActive(dashboard.href, pathname)) return { section: null, link: dashboard, deeper: false };
  for (const group of navGroups(superadmin)) {
    const link = group.links.find((l) => isNavActive(l.href, pathname));
    if (link) {
      const hub = link.href.startsWith("/admin/settings") ? "/admin/settings" : link.href;
      return { section: group.key, link, deeper: pathname !== link.href && pathname !== hub };
    }
  }
  return null;
}
