/**
 * LISSAGE DU QUOTA : freiner AVANT le mur, pas une fois dedans.
 *
 * `link-usage.ts` sait dire « tu as consommé 82 % de ton forfait » et bride une
 * fois le plafond atteint. Ça ne protège de rien : un hotspot qui brûle ses
 * 4,5 To en dix jours passe les vingt suivants à 64 kbit/s. Le mal est fait au
 * moment où on le détecte.
 *
 * Ce module ajoute la dimension manquante — le RYTHME. À chaque instant du
 * cycle il existe une consommation « à l'heure » : celle qui, tenue jusqu'au
 * bout, épuise le forfait pile à la fin. On la compare au réel, et on freine
 * proportionnellement à l'avance prise.
 *
 * ─── Pourquoi aucun compteur journalier ────────────────────────────────────
 *
 * La version évidente garde un compteur du jour et le compare à un budget
 * quotidien. Elle impose un accumulateur de plus (donc une colonne, donc une
 * migration) et elle est FRAGILE : un relevé manqué à minuit fausse la journée.
 *
 * On s'en passe. La décision se lit entièrement dans le cumul du cycle, que
 * `accumulate()` tient déjà : il suffit de le comparer à la LIGNE DE RYTHME
 * (quota × fraction du cycle écoulée). Un dépassement du lundi rend la ligne
 * plus dure le mardi — le rattrapage est automatique, sans état ajouté.
 *
 * ─── Le cycle n'est PAS le mois calendaire ─────────────────────────────────
 *
 * Un forfait SafeLinkHub se remet à zéro le `billingCycleDay` (1-28), pas le
 * 1er. Tout se calcule donc à partir de `cycleStart()` de link-usage.ts, jamais
 * à partir de `getUTCMonth()` — sinon un routeur facturé le 15 verrait son
 * budget se réinitialiser deux semaines trop tôt.
 *
 * Tout est PUR : testable sans routeur et sans base.
 */
import { cycleStart } from "./link-usage";

const MS_DAY = 86_400_000;
const MB = 1024 * 1024;

/**
 * Part du quota qu'on s'autorise réellement à dépenser. Les 5 % restants
 * absorbent ce que le comptage ne voit pas : le trafic écoulé entre deux
 * relevés, et celui du tout début de cycle avant la première mesure.
 */
export const SAFETY = 0.95;

/**
 * Avance tolérée sur la ligne de rythme avant de passer du bridage au blocage.
 * 1,1 = « 10 % devant » — assez large pour ne pas punir une soirée chargée,
 * assez serré pour qu'une fuite (mise à jour d'OS, torrent) soit coupée.
 */
export const CRITICAL_RATIO = 1.1;

/** `ok` = rien à faire · `throttle` = on freine · `block` = on coupe le débit. */
export type PacingLevel = "ok" | "throttle" | "block";

export type CycleDays = {
  /** Longueur du cycle courant, en jours (28 à 31 selon le mois). */
  total: number;
  /** Jours entamés, aujourd'hui compris — vaut 1 le jour de facturation. */
  elapsed: number;
  /** Jours restants, aujourd'hui compris — vaut 1 le dernier jour. */
  remaining: number;
};

export type Pacing = {
  level: PacingLevel;
  /**
   * Consommation qui serait « à l'heure » maintenant. `null` si le lien est
   * illimité.
   */
  onPaceBytes: number | null;
  /** Réel ÷ ligne de rythme. 1 = pile à l'heure, 1,4 = 40 % d'avance. */
  ratio: number;
  /**
   * Ce qu'il reste à dépenser aujourd'hui pour finir le cycle sans dépasser :
   * (budget − consommé) ÷ jours restants. C'est le chiffre à afficher, et
   * celui qui alimente la file d'attente du routeur.
   */
  dailyBudgetBytes: number | null;
  /** Consommation projetée en fin de cycle si le rythme actuel se maintient. */
  projectedBytes: number | null;
  days: CycleDays;
};

/**
 * Découpe le cycle de facturation courant en jours.
 *
 * `elapsed` compte les jours ENTAMÉS (1 le jour même de la facturation), et
 * jamais 0 : une fraction de journée nulle mettrait la ligne de rythme à zéro
 * et ferait basculer en blocage au premier octet du cycle.
 */
export function cycleDays(now: Date, billingDay: number): CycleDays {
  const start = cycleStart(now, billingDay);
  // `cycleStart` borne le jour à 28, donc « le mois suivant, même jour » existe
  // toujours — pas de glissement du 31 vers le 3 mars.
  const next = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
  );
  const total = Math.round((next.getTime() - start.getTime()) / MS_DAY);
  const elapsed = Math.min(total, Math.max(1, Math.floor((now.getTime() - start.getTime()) / MS_DAY) + 1));
  return { total, elapsed, remaining: total - elapsed + 1 };
}

/**
 * Verdict de rythme pour un cumul de cycle donné.
 *
 * `usedBytes` vient de l'accumulateur de link-usage.ts ; `quotaMb` est le
 * plafond du lien (null ou ≤ 0 = illimité, aucun freinage).
 */
export function pace(
  usedBytes: number,
  quotaMb: number | null,
  now: Date,
  billingDay: number,
): Pacing {
  const days = cycleDays(now, billingDay);

  if (!quotaMb || quotaMb <= 0) {
    return {
      level: "ok",
      onPaceBytes: null,
      ratio: 0,
      dailyBudgetBytes: null,
      projectedBytes: null,
      days,
    };
  }

  const quotaBytes = quotaMb * MB;
  const budget = quotaBytes * SAFETY;
  const onPaceBytes = budget * (days.elapsed / days.total);
  const used = Math.max(0, usedBytes);
  const ratio = used / onPaceBytes;

  // Le blocage répond à DEUX conditions : l'avance excessive sur le rythme, et
  // le plafond dur atteint. La seconde compte pour elle-même — en fin de cycle
  // la ligne de rythme rejoint le budget, donc un dépassement du plafond réel
  // n'y apparaîtrait que comme une avance modeste.
  const level: PacingLevel =
    used >= quotaBytes || ratio > CRITICAL_RATIO ? "block" : ratio > 1 ? "throttle" : "ok";

  return {
    level,
    onPaceBytes,
    ratio,
    dailyBudgetBytes: Math.max(0, budget - used) / days.remaining,
    projectedBytes: (used / days.elapsed) * days.total,
    days,
  };
}
