/**
 * Le BALAYAGE qui supprime les tickets périmés, et pourquoi il peut ne rien
 * supprimer du tout.
 *
 * Chaque profil hotspot a son planificateur (nommé comme lui, toutes les
 * ~2 min 30). Son script calcule la date du jour, puis compare :
 *
 *     :local date [ /system clock get date ];
 *     :local today [$dateint d=$date] ;
 *     … :if ($expd < $today …) do={ /ip hotspot user remove $i }
 *
 * `$dateint` découpe la date À POSITION FIXE : jour en 4-6, mois en 0-3, année
 * en 7-11 — c'est-à-dire la forme « aug/24/2026 ».
 *
 * RouterOS 7.24 rend désormais « 2026-08-24 ». Sur cette chaîne, le découpage
 * donne mois = « 202 », jour = « -0 », année = « -24 » : `$today` devient un
 * nombre absurde. AUCUNE comparaison ne peut alors être vraie, et le balayage
 * ne supprime PLUS RIEN — quel que soit le format des commentaires.
 *
 * Le script du catalogue SafeLinkHub contient la conversion qui manque :
 *
 *     :if ([:pick $date 4 5] = "-") do={ … 2026-08-24 → aug/24/2026 … };
 *
 * Mais un routeur qui a reçu ses profils autrement — MikHmon à la main, ou la
 * restauration d'une sauvegarde antérieure — porte l'ancienne version. Mesuré
 * sur HTSPT-TREW le 2026-08-24 : neuf planificateurs actifs, exécutés toutes
 * les 2 min 30, et 102 tickets périmés toujours en place, dont certains depuis
 * cinq mois.
 *
 * Ce module RECONNAÎT un balayage aveugle et sait le réécrire, en conservant
 * le profil qu'il vise — y compris les profils personnalisés (« 5-jour »,
 * « Ordinateur- »…), qui ne sont pas au catalogue.
 */
import { VOUCHER_PROFILES } from "./voucher-profiles";

/** Un script de balayage se reconnaît à la boucle qu'il exécute. */
const CIBLE_PROFIL = /\/ip hotspot user find where profile="([^"]+)"/;

/** Le profil balayé par ce script, ou null si ce n'en est pas un. */
export function sweptProfile(onEvent: string): string | null {
  return onEvent.match(CIBLE_PROFIL)?.[1] ?? null;
}

/**
 * Le script sait-il lire une date ISO ?
 *
 * On cherche la conversion appliquée à `$date` — celle du jour courant. Un
 * script peut convertir `$exp` (la valeur du planificateur) sans convertir
 * `$date` : c'est exactement le cas des scripts MikHmon d'origine, et c'est
 * `$date` qui décide.
 */
export function handlesIsoClock(onEvent: string): boolean {
  return /:if\s*\(\[:pick \$date 4 5\]\s*=\s*"-"\)/.test(onEvent);
}

/**
 * Script de balayage à jour pour un profil donné.
 *
 * Repris TEL QUEL du catalogue (profil « 01-JOUR »), seul le nom du profil
 * visé change : c'est le texte déjà en service sur le parc sain, pas une
 * réécriture maison qu'il faudrait re-valider.
 */
export function buildSweepScript(profileName: string): string {
  const modele = VOUCHER_PROFILES.find((p) => p.name === "01-JOUR")?.monitorOnEvent;
  if (!modele) throw new Error("Modèle de balayage introuvable dans le catalogue.");
  if (!handlesIsoClock(modele)) {
    // Garde-fou : si le catalogue perdait la conversion, ce correctif
    // propagerait la panne sur tout le parc au lieu de la réparer.
    throw new Error("Le modèle du catalogue ne gère pas l'horloge ISO.");
  }
  return modele.replace(CIBLE_PROFIL, `/ip hotspot user find where profile="${profileName}"`);
}

export type SweepScheduler = {
  name?: string;
  "on-event"?: string;
  ".id"?: string;
  interval?: string;
};

export type SweepInspection = {
  /** Balayages trouvés, tous profils confondus. */
  total: number;
  /** Balayages aveugles à l'horloge ISO — ceux qui ne suppriment rien. */
  stale: { id: string; name: string; profile: string; script: string; interval: string }[];
};

/** Fonction PURE : le verdict se teste sans routeur. */
export function inspectSweepSchedulers(schedulers: SweepScheduler[]): SweepInspection {
  let total = 0;
  const stale: SweepInspection["stale"] = [];

  for (const s of schedulers) {
    const onEvent = s["on-event"] ?? "";
    const profile = sweptProfile(onEvent);
    if (!profile) continue; // pas un balayage (MIKHMON_BOOT, CLEAN_JOB…)
    total++;
    if (handlesIsoClock(onEvent)) continue;
    if (!s[".id"]) continue;
    stale.push({
      id: s[".id"],
      name: s.name ?? profile,
      profile,
      script: buildSweepScript(profile),
      /* L'intervalle d'origine est repris tel quel. Les valeurs du parc sont
         volontairement décalées (2m12s, 2m30s, 2m58s…) pour que huit
         balayages ne tombent pas tous à la même seconde sur un routeur qui
         compte des milliers de tickets. */
      interval: s.interval ?? "2m30s",
    });
  }

  return { total, stale };
}
