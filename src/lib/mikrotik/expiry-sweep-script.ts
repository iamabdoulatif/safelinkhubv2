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

/* ═══════════════════════════════════════════════════════════════════════
   L'AUTRE MOITIÉ : le script `on-login` du profil.

   Le balayage remis à neuf retire ce qui est périmé, mais c'est le
   `on-login` qui ÉCRIT la date à la première connexion. Sa version d'origine
   lit `next-run` du planificateur temporaire et se contente de :

       :local getxp [len $exp];
       :if ($getxp > 15) do={ … set comment="$exp" … }

   Sur RouterOS 7.24, `next-run` rend « 2026-08-25 02:15:40 » — 19 caractères,
   donc « > 15 », donc écrit TEL QUEL. Chaque nouvelle connexion refabrique
   ainsi un commentaire que le balayage ne sait pas lire. Réparer le balayage
   sans réparer ceci, c'est vider une baignoire robinet ouvert.

   On n'échange PAS tout le script : il porte la durée, le prix et le nom du
   profil, qui diffèrent d'un routeur à l'autre — et pour un profil
   personnalisé (« 5-jour », « Ordinateur- ») on ne saurait pas les
   reconstituer. On INSÈRE les deux conversions manquantes, prélevées sur le
   script du catalogue pour rester à une seule source de vérité.
   ═══════════════════════════════════════════════════════════════════════ */

/** Découpe un bloc du script de référence entre deux repères. */
function extraitDuCatalogue(depuis: string, jusqua: string): string {
  const modele = VOUCHER_PROFILES.find((p) => p.name === "01-JOUR")?.onLogin ?? "";
  const i = modele.indexOf(depuis);
  const j = modele.indexOf(jusqua, i + depuis.length);
  if (i < 0 || j < 0) {
    throw new Error("Bloc de conversion introuvable dans le script du catalogue.");
  }
  return modele.slice(i + depuis.length, j);
}

const ANCRE_DATE = ":local date [ /system clock get date ];";
const ANCRE_EXP = "next-run];";

/** Conversion « 2026-08-24 » → « aug/24/2026 » appliquée à $date. */
const BLOC_DATE = extraitDuCatalogue(ANCRE_DATE, ":local year");
/** Même conversion appliquée à $exp, la valeur rendue par le planificateur. */
const BLOC_EXP = extraitDuCatalogue(ANCRE_EXP, ":local getxp");

/**
 * Le `on-login` sait-il déjà lire l'horloge ISO ?
 *
 * DEUX façons de savoir, et il a fallu un routeur cassé pour l'apprendre.
 * La nôtre — le bloc que nous insérons — se reconnaît à `[:pick $date 4 5]`.
 * Mais les versions RÉCENTES de MikHmon convertissent l'ISO à leur manière,
 * en cherchant un tiret dans la chaîne (`[:find $date "-"]`), et ce test-là
 * ne les voyait pas.
 *
 * Conséquence mesurée sur HSPT-FOUANGA le 2026-09-04 : le correctif a ajouté
 * SA conversion par-dessus celle de MikHmon. La première rendait
 * « sep/06/2026 21:40:30 », la seconde la reprenait comme si c'était encore
 * de l'ISO et en tirait « jan/02/sep/  21:40:3 » — une année « sep/ », que le
 * balayage ne peut pas comparer. 202 tickets devenus éternels en deux jours,
 * et le journal de revenu, écrit en fin du même script, arrêté net.
 *
 * Un script qui sait déjà lire l'ISO — de l'une OU l'autre façon — ne doit
 * plus jamais être « complété ».
 */
export function onLoginHandlesIsoClock(onLogin: string): boolean {
  const notreBloc = /:if\s*\(\[:pick \$date 4 5\]\s*=\s*"-"\)/.test(onLogin);
  const blocMikhmon =
    /:find \$date "-"/.test(onLogin) && /:find \$exp "-"/.test(onLogin);
  return notreBloc || blocMikhmon;
}

/**
 * Insère les deux conversions manquantes. Rend `null` si le script les a déjà,
 * ou si ses repères sont absents — on ne réécrit jamais un script qu'on n'a pas
 * reconnu.
 */
export function patchOnLoginForIsoClock(onLogin: string): string | null {
  if (!onLogin || onLoginHandlesIsoClock(onLogin)) return null;
  const iDate = onLogin.indexOf(ANCRE_DATE);
  const iExp = onLogin.indexOf(ANCRE_EXP);
  if (iDate < 0 || iExp < 0) return null;

  const posDate = iDate + ANCRE_DATE.length;
  const posExp = iExp + ANCRE_EXP.length;
  // L'insertion la plus TARDIVE d'abord : sinon la première décale la seconde.
  const [premier, second] = posDate < posExp ? [posExp, posDate] : [posDate, posExp];
  const blocPremier = premier === posExp ? BLOC_EXP : BLOC_DATE;
  const blocSecond = second === posExp ? BLOC_EXP : BLOC_DATE;

  let out = onLogin.slice(0, premier) + blocPremier + onLogin.slice(premier);
  out = out.slice(0, second) + blocSecond + out.slice(second);
  return out;
}

export type ProfileOnLogin = { name?: string; "on-login"?: string; ".id"?: string };

export type OnLoginInspection = {
  total: number;
  stale: { id: string; name: string; script: string }[];
};

/** Fonction PURE : quels profils réécrivent des dates illisibles ? */
export function inspectProfileOnLogin(profiles: ProfileOnLogin[]): OnLoginInspection {
  let total = 0;
  const stale: OnLoginInspection["stale"] = [];
  for (const p of profiles) {
    const onLogin = p["on-login"] ?? "";
    if (!onLogin) continue;
    total++;
    const patched = patchOnLoginForIsoClock(onLogin);
    if (!patched || !p[".id"]) continue;
    stale.push({ id: p[".id"], name: p.name ?? "?", script: patched });
  }
  return { total, stale };
}
