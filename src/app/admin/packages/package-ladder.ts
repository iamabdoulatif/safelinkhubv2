/**
 * Le catalogue, lu comme une GRILLE TARIFAIRE et non comme une liste de lignes.
 *
 * L'écran affichait les forfaits à plat, dans l'ordre de création, avec la zone
 * répétée en pastille sur chaque ligne. Or personne ne possède « des forfaits » :
 * on possède le catalogue d'une zone — cinq paliers de durée, du passage d'une
 * heure à l'abonnement du mois. La vraie question de l'exploitant n'est pas
 * « quels forfaits existe-t-il ? » mais « ma grille se tient-elle ? ».
 *
 * D'où le TARIF JOURNALIER ÉQUIVALENT : ramenés au même dénominateur, 100 FCFA
 * les 5 h et 3 000 FCFA le mois deviennent comparables (480 F/jour contre 100).
 * Une grille saine décroît à mesure que la durée s'allonge — c'est la remise de
 * volume. Quand un palier coûte plus cher par jour que le palier plus court qui
 * le précède, le client n'a aucune raison de le prendre : cette inversion-là
 * était invisible dans un tableau, elle se signale maintenant toute seule.
 */
export function formatFcfa(value: number): string {
  return `FCFA ${value.toLocaleString("fr-FR")}`;
}

export type ForfaitBrut = {
  id: string;
  name: string;
  priceCents: number;
  durationValue: number;
  durationUnit: string;
  commissionCents: number;
  uploadMbps: number | null;
  downloadMbps: number | null;
  active: boolean;
  routerId: string | null;
  routerName: string | null;
};

const MINUTES_PAR_UNITE: Record<string, number> = {
  Minutes: 1,
  Hours: 60,
  Days: 1440,
  // Mois commercial : 30 jours. Le tarif journalier n'est qu'une comparaison,
  // pas une facturation — inutile d'aller chercher la longueur réelle du mois.
  Weeks: 10080,
  Months: 43200,
};

/** Durée en minutes, ou null si l'unité n'est pas connue (données anciennes). */
export function dureeEnMinutes(value: number, unit: string): number | null {
  const facteur = MINUTES_PAR_UNITE[unit];
  if (!facteur || !Number.isFinite(value) || value <= 0) return null;
  return value * facteur;
}

/** Prix ramené à la journée, pour comparer des paliers de durées différentes. */
export function tarifJournalier(priceCents: number, minutes: number | null): number | null {
  if (!minutes || minutes <= 0) return null;
  return Math.round((priceCents * 1440) / minutes);
}

const LIBELLES: Record<string, [string, string]> = {
  Minutes: ["minute", "minutes"],
  Hours: ["heure", "heures"],
  Days: ["jour", "jours"],
  Weeks: ["semaine", "semaines"],
  Months: ["mois", "mois"],
};

export function libelleDuree(value: number, unit: string): string {
  const paire = LIBELLES[unit];
  if (!paire) return `${value} ${unit}`;
  return `${value} ${value > 1 ? paire[1] : paire[0]}`;
}

export type ForfaitClasse = ForfaitBrut & {
  minutes: number | null;
  parJour: number | null;
  /** Coûte au moins aussi cher par jour que le palier plus court juste avant. */
  inversion: boolean;
  /** Nom de ce palier plus court — pour dire de QUI on parle. */
  inversionContre: string | null;
  /** Prix le plus élevé qui rétablit la grille, en FCFA. Null hors inversion. */
  prixMax: number | null;
};

export type ZoneCatalogue = {
  cle: string;
  nom: string;
  forfaits: ForfaitClasse[];
  /** Débit commun à tous les forfaits de la zone, sinon null (affiché par ligne). */
  debitCommun: string | null;
  /** Commission commune à tous les forfaits de la zone, sinon null. */
  commissionCommune: number | null;
};

function debitLabel(f: ForfaitBrut) {
  return `${f.uploadMbps ?? 0}M/${f.downloadMbps ?? 0}M`;
}

function commun<T>(valeurs: T[]): T | null {
  if (valeurs.length === 0) return null;
  return valeurs.every((v) => v === valeurs[0]) ? valeurs[0] : null;
}

/**
 * Regroupe par zone, ordonne chaque zone par durée croissante et repère les
 * inversions de grille. Le groupe « global » (forfaits sans routeur) passe en
 * dernier : il concerne tout le parc, on ne le consulte pas en premier.
 */
export function grouperForfaits(rows: ForfaitBrut[]): ZoneCatalogue[] {
  const parZone = new Map<string, ForfaitBrut[]>();
  for (const row of rows) {
    const cle = row.routerId ?? "__global__";
    const liste = parZone.get(cle);
    if (liste) liste.push(row);
    else parZone.set(cle, [row]);
  }

  const zones: ZoneCatalogue[] = [];
  for (const [cle, liste] of parZone) {
    const triees = [...liste].sort((a, b) => {
      const ma = dureeEnMinutes(a.durationValue, a.durationUnit);
      const mb = dureeEnMinutes(b.durationValue, b.durationUnit);
      // Durée inconnue : en fin de liste, sans perturber l'ordre du reste.
      if (ma === null) return mb === null ? a.name.localeCompare(b.name) : 1;
      if (mb === null) return -1;
      return ma - mb || a.name.localeCompare(b.name);
    });

    const forfaits: ForfaitClasse[] = [];
    let precedent: ForfaitClasse | null = null;
    for (const f of triees) {
      const minutes = dureeEnMinutes(f.durationValue, f.durationUnit);
      const parJour = tarifJournalier(f.priceCents, minutes);
      /* On ne compare qu'entre paliers actifs et chiffrables : un forfait
         désactivé n'est plus proposé, il ne peut donc pas rendre le suivant
         incohérent. */
      const compare =
        precedent && precedent.parJour !== null && parJour !== null && f.active && precedent.active;
      // STRICTEMENT plus cher : au même tarif journalier, le palier plus long
      // reste un choix légitime — il n'y a simplement pas de remise de volume.
      const inversion = Boolean(compare && parJour > (precedent as ForfaitClasse).parJour!);
      const classe: ForfaitClasse = {
        ...f,
        minutes,
        parJour,
        inversion,
        inversionContre: inversion ? (precedent as ForfaitClasse).name : null,
        /* Le prix le plus haut qui remet le palier au niveau du précédent :
           signaler l'incohérence sans dire de combien, c'est laisser le calcul
           à faire de tête devant l'écran. */
        prixMax:
          inversion && minutes
            ? Math.floor(((precedent as ForfaitClasse).parJour! * minutes) / 1440)
            : null,
      };
      forfaits.push(classe);
      if (parJour !== null && f.active) precedent = classe;
    }

    zones.push({
      cle,
      nom: liste[0].routerName ?? "Tous les routeurs",
      forfaits,
      debitCommun: commun(forfaits.map(debitLabel)),
      commissionCommune: commun(forfaits.map((f) => f.commissionCents)),
    });
  }

  return zones.sort((a, b) => {
    if (a.cle === "__global__") return 1;
    if (b.cle === "__global__") return -1;
    return a.nom.localeCompare(b.nom, "fr");
  });
}
