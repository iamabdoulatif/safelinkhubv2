/**
 * Répartition du revenu encaissé par zone Wi-Fi (un routeur = une zone).
 *
 * L'écran des ventes listait les tickets sans dire d'où ils venaient : avec
 * plusieurs zones, impossible de savoir laquelle rapporte. L'information dort
 * pourtant en base depuis toujours — `portal_orders.router_id` est renseignée
 * sur chaque commande — elle n'était simplement jamais affichée.
 *
 * Fonction PURE, séparée de la page : c'est un calcul d'argent, il doit se
 * vérifier sans base ni rendu.
 */

export type VenteZone = {
  routerId: string | null;
  routerName: string | null;
  priceCents: number;
  commissionCents: number;
};

export type LigneZone = {
  routerId: string | null;
  /** Ce qu'on affiche. Une commande sans routeur garde une étiquette explicite. */
  nom: string;
  ventes: number;
  revenuCents: number;
  commissionCents: number;
  /** Part du revenu total, en pourcentage entier. */
  part: number;
};

/** Étiquette d'une zone dont le routeur a été supprimé, ou jamais enregistré. */
export const ZONE_INCONNUE = "Zone non identifiée";

/**
 * Groupe les ventes par routeur, la plus rentable d'abord.
 *
 * Le groupement se fait sur l'IDENTIFIANT, jamais sur le nom : deux routeurs
 * peuvent porter le même nom (« HOTSPOT » revient souvent), et les fondre
 * ferait disparaître une zone de la liste tout en gonflant l'autre. Le nom
 * n'est qu'une étiquette.
 */
export function revenuParZone(ventes: readonly VenteZone[]): LigneZone[] {
  const total = ventes.reduce((s, v) => s + v.priceCents, 0);
  const groupes = new Map<string, LigneZone>();

  for (const v of ventes) {
    const cle = v.routerId ?? "~sans-routeur";
    const ligne = groupes.get(cle) ?? {
      routerId: v.routerId,
      nom: v.routerName ?? ZONE_INCONNUE,
      ventes: 0,
      revenuCents: 0,
      commissionCents: 0,
      part: 0,
    };
    ligne.ventes += 1;
    ligne.revenuCents += v.priceCents;
    ligne.commissionCents += v.commissionCents;
    groupes.set(cle, ligne);
  }

  return [...groupes.values()]
    .map((l) => ({
      ...l,
      // Division gardée : sans vente, le total est nul et la part n'a pas de
      // sens — 0 plutôt qu'un NaN affiché à l'écran.
      part: total > 0 ? Math.round((l.revenuCents / total) * 100) : 0,
    }))
    .sort((a, b) => b.revenuCents - a.revenuCents || a.nom.localeCompare(b.nom));
}
