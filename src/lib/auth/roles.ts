/**
 * Rôles d'un compte SafeLinkHub et ce que chacun a le droit de faire.
 *
 * Module « plain » (pas de "use server", pas de "server-only") : la barre
 * latérale et les écrans clients en ont besoin autant que les actions
 * serveur.
 *
 * PRINCIPE : refus par défaut. `requireAdminSession` garde exactement le sens
 * qu'il avait — administrateur complet — et chaque écriture reste donc
 * réservée à l'admin tant qu'on ne lui a pas explicitement accordé une
 * capacité. L'inverse (ouvrir à tous les rôles puis restreindre) aurait donné
 * les pleins pouvoirs à un lecteur au premier oubli.
 */

export const ROLES = [
  {
    id: "admin",
    label: "Administrateur",
    description: "Accès complet : facturation, réglages, membres, parc et ventes.",
  },
  {
    id: "editor",
    label: "Éditeur",
    description:
      "Exploite au quotidien — routeurs, forfaits, tickets, portails. Ne touche ni à la facturation, ni aux réglages, ni aux membres.",
  },
  {
    id: "sales_agent",
    label: "Agent de vente",
    description:
      "Génère et gère les tickets, rien d'autre. À ne pas confondre avec les agents de /admin/agent, qui sont des revendeurs sans compte SafeLinkHub.",
  },
  {
    id: "viewer",
    label: "Lecteur",
    description: "Consultation seule : tableaux de bord et rapports, aucune écriture.",
  },
] as const;

export type Role = (typeof ROLES)[number]["id"];

/** Le superadmin n'est PAS dans ROLES : il ne s'attribue pas depuis un compte,
 *  il se pose en base. L'exposer dans le sélecteur de rôles aurait permis à un
 *  admin de se fabriquer un superadmin. */
export type AnyRole = Role | "superadmin";

export type Capability =
  /** Inviter, changer de rôle, retirer un membre. */
  | "members"
  /** Portefeuille, pack revendeur, moyens de paiement. */
  | "billing"
  /** Réglages de l'organisation, passerelles, portails par défaut. */
  | "settings"
  /** Lier, configurer, réinitialiser un MikroTik ; demander un transfert. */
  | "routers"
  /** Créer et modifier les forfaits. */
  | "packages"
  /** Générer, imprimer, supprimer des tickets. */
  | "tickets";

const CAPACITES: Record<AnyRole, readonly Capability[]> = {
  superadmin: ["members", "billing", "settings", "routers", "packages", "tickets"],
  admin: ["members", "billing", "settings", "routers", "packages", "tickets"],
  editor: ["routers", "packages", "tickets"],
  sales_agent: ["tickets"],
  viewer: [],
};

export function isRole(value: string): value is Role {
  return ROLES.some((r) => r.id === value);
}

/** Tout rôle qui donne accès à l'espace d'administration, en lecture au moins. */
export function isMemberRole(role: string | undefined): boolean {
  return role === "superadmin" || (typeof role === "string" && isRole(role));
}

export function can(role: string | undefined, capability: Capability): boolean {
  if (!role) return false;
  const accordees = CAPACITES[role as AnyRole];
  return accordees ? accordees.includes(capability) : false;
}

export function roleLabel(role: string): string {
  if (role === "superadmin") return "Superadmin";
  return ROLES.find((r) => r.id === role)?.label ?? role;
}
