import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vouchers, voucherRouters, routers, packages, roamingProfiles } from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import { durationFromProfileName, durationToMs, type PackageDuration } from "./expiry";

// ─────────────────────────────────────────────────────────────────────────
// Décompte PARTAGÉ entre routeurs (étape 2).
//
// Chaque routeur écrit, à la 1ʳᵉ connexion d'un code, un `comment` sur son
// utilisateur hotspot au format MikHmon « mmm/JJ/AAAA HH:MM:SS » = date
// d'expiration (login + durée), et son scheduler local supprime le user à
// cette date. Ce module lit ces commentaires, prend le PLUS TÔT parmi les
// routeurs d'un même voucher (= la vraie 1ʳᵉ connexion), le fige en base
// (firstLoginAt / expiresAt) PUIS réécrit ce même commentaire sur TOUS les
// routeurs du voucher. Effet :
//   • les zones expirent toutes au même instant ;
//   • pré-poser le commentaire empêche l'autre routeur de redémarrer le
//     compteur (son on-login voit un commentaire déjà présent → il n'en
//     recalcule pas), donc pas de cumul de durée d'une zone à l'autre.
//
// Aucune modification des scripts MikHmon de prod : on ne fait que lire et
// réécrire le champ `comment`, exactement dans le format que le sweep attend.
// ─────────────────────────────────────────────────────────────────────────

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

export type Wall = { y: number; mon: number; d: number; h: number; mi: number; s: number };

/** Parse « mmm/JJ/AAAA HH:MM:SS » (ex. "jul/10/2026 14:30:00"). null si autre chose. */
export function parseExpiryComment(comment: string): Wall | null {
  if (!comment || comment.length < 19) return null;
  if (comment[3] !== "/" || comment[6] !== "/" || comment[11] !== " ") return null;
  const mon = MONTHS.indexOf(comment.slice(0, 3).toLowerCase());
  if (mon < 0) return null;
  const d = Number(comment.slice(4, 6));
  const y = Number(comment.slice(7, 11));
  const h = Number(comment.slice(12, 14));
  const mi = Number(comment.slice(15, 17));
  const s = Number(comment.slice(18, 20));
  if ([d, y, h, mi, s].some((n) => !Number.isInteger(n))) return null;
  if (mon > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return { y, mon, d, h, mi, s };
}

/** Clé triable (ordre chronologique) sans passer par un fuseau. */
export function wallKey(w: Wall): number {
  return ((((w.y * 12 + w.mon) * 31 + w.d) * 24 + w.h) * 60 + w.mi) * 60 + w.s;
}

/** Reconstruit la chaîne au format MikHmon attendu par le sweep. */
export function formatExpiryComment(w: Wall): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${MONTHS[w.mon]}/${p2(w.d)}/${w.y} ${p2(w.h)}:${p2(w.mi)}:${p2(w.s)}`;
}

/**
 * Le commentaire d'un ticket MikHmon a DEUX champs, pas un.
 *
 * Vérifié dans la source de l'image (`hotspot/userbyname.php`) : quand les
 * caractères 3 et 6 sont des « / », MikHmon lit `substr($comment, 0, 20)` comme
 * l'expiration (champ « Expired », désactivé dans son UI) et
 * `substr($comment, 21)` comme un commentaire libre (champ « Comment »,
 * éditable). Le caractère 20 est le séparateur. Le sweep RouterOS, lui, ne lit
 * que les positions 0→20. Écrire notre date de DÉBUT à partir de 21 tombe donc
 * exactement dans l'emplacement prévu, sans rien casser côté routeur ni côté
 * MikHmon.
 */
const COMMENT_BODY_AT = 21;

/** Préfixe de NOTRE suffixe — sert aussi à le reconnaître pour le réécrire. */
const START_MARKER = "debut ";

/** Le champ libre d'un commentaire MikHmon (chaîne vide s'il n'y en a pas). */
export function commentBody(comment: string): string {
  return comment.length > COMMENT_BODY_AT ? comment.slice(COMMENT_BODY_AT) : "";
}

/**
 * Assemble le commentaire à poser : expiration + date de début.
 *
 * Ne PIÉTINE PAS une note d'admin : si le champ libre contient déjà autre chose
 * que notre date de début, on la préserve telle quelle et on renonce à écrire le
 * début. (Avant, ce module réécrivait les 20 caractères d'expiration SEULS, ce
 * qui effaçait silencieusement toute note saisie dans MikHmon.)
 */
export function buildUserComment(expiry: Wall, start: Wall | null, current: string): string {
  const head = formatExpiryComment(expiry);
  const body = commentBody(current);
  if (start && (body === "" || body.startsWith(START_MARKER))) {
    return `${head} ${START_MARKER}${formatExpiryComment(start)}`;
  }
  return body ? `${head} ${body}` : head;
}

// On traite les composantes comme de l'« heure murale » : parse et format via
// UTC pour un aller-retour exact. L'affichage admin (Intl sans timezone sur le
// runtime UTC) montre donc les mêmes composantes que le routeur. Hypothèse :
// les routeurs d'une org partagent le même fuseau (zones WiFi d'un même pays).
export function wallToDate(w: Wall): Date {
  return new Date(Date.UTC(w.y, w.mon, w.d, w.h, w.mi, w.s));
}

/** Inverse de wallToDate — même convention « heure murale via UTC ». */
export function dateToWall(d: Date): Wall {
  return {
    y: d.getUTCFullYear(),
    mon: d.getUTCMonth(),
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    s: d.getUTCSeconds(),
  };
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await fn(item);
      }
    }),
  );
}

// `comment` en plus de `wall` : la comparaison « faut-il réécrire ? » porte sur
// la chaîne ENTIÈRE (expiration + champ libre), pas seulement sur la date —
// sinon un ticket dont la date est déjà bonne ne recevrait jamais sa date de
// début.
type UserRow = { id: string; wall: Wall | null; comment: string };

/**
 * Plafond d'écritures par passage, tous routeurs confondus.
 *
 * Ce module tourne toutes les 2 min. Tant qu'il ne réécrivait que les
 * commentaires dont la DATE divergeait, une passe touchait une poignée de
 * tickets. Depuis qu'il pose aussi la date de début, tout ticket actif qui ne
 * l'a pas encore diverge — le premier passage après un déploiement voudrait donc
 * réécrire le parc entier d'un coup, soit des milliers de
 * `/ip/hotspot/user/set`. Un RB951 (mono-cœur, 128 Mo) monte à 100 % de CPU sur
 * bien moins que ça, et c'est le portail de ses clients connectés qui en pâtit.
 *
 * Avec ce plafond, le rattrapage s'étale sur quelques heures (200 × 30/h) sans
 * que personne ne le remarque, et le régime permanent — quelques écritures par
 * passage — n'est jamais freiné. `writesDeferred` dit ce qui a été remis à plus
 * tard : un plafond silencieux se lirait comme « tout est à jour ».
 */
const MAX_WRITES_PER_RUN = 200;

export type ReconcileResult = {
  vouchersConsidered: number;
  frozen: number; // vouchers dont l'expiration a été figée en base ce run
  propagated: number; // commentaires (re)posés sur des routeurs
  /** Écritures reportées au prochain passage par MAX_WRITES_PER_RUN. */
  writesDeferred: number;
  routersRead: number;
  routerErrors: string[];
};

export async function reconcileVoucherExpiries(orgId?: string): Promise<ReconcileResult> {
  const db = getDb();
  const now = Date.now();

  const baseQuery = db
    .select({
      voucherId: voucherRouters.voucherId,
      routerId: voucherRouters.routerId,
      username: vouchers.username,
      expiresAt: vouchers.expiresAt,
      // Repli quand le forfait a été élagué (packageId → NULL par FK) : le
      // voucher garde son profil, donc sa durée réelle. Sans ça, `pkg` est null
      // et la date de début reste introuvable — le même trou que le fix v80,
      // mais côté décompte au lieu de l'affichage.
      profileName: vouchers.profileName,
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
      billingStartsOn: packages.billingStartsOn,
      roamingDurationValue: roamingProfiles.durationValue,
      roamingDurationUnit: roamingProfiles.durationUnit,
    })
    .from(voucherRouters)
    .innerJoin(vouchers, eq(voucherRouters.voucherId, vouchers.id))
    .leftJoin(packages, eq(vouchers.packageId, packages.id))
    .leftJoin(roamingProfiles, eq(vouchers.roamingProfileId, roamingProfiles.id));
  const rows = orgId
    ? await baseQuery.where(eq(voucherRouters.orgId, orgId))
    : await baseQuery;

  type Vou = {
    voucherId: string;
    username: string;
    expiresAt: Date | null;
    pkg: PackageDuration | null;
    routerIds: string[];
  };
  const byVoucher = new Map<string, Vou>();
  const routerSet = new Set<string>();
  for (const r of rows) {
    // On ignore les vouchers déjà expirés (le sweep local nettoie).
    if (r.expiresAt && r.expiresAt.getTime() <= now) continue;
    routerSet.add(r.routerId);
    const existing = byVoucher.get(r.voucherId);
    const pkg: PackageDuration | null = r.durationValue
      ? {
          durationValue: r.durationValue,
          durationUnit: r.durationUnit!,
          billingStartsOn: r.billingStartsOn!,
        }
      : r.roamingDurationValue
        ? {
            durationValue: r.roamingDurationValue,
            durationUnit: r.roamingDurationUnit!,
            billingStartsOn: "Upon First Use",
          }
        : durationFromProfileName(r.profileName);
    if (existing) existing.routerIds.push(r.routerId);
    else
      byVoucher.set(r.voucherId, {
        voucherId: r.voucherId,
        username: r.username,
        expiresAt: r.expiresAt,
        pkg,
        routerIds: [r.routerId],
      });
  }

  const result: ReconcileResult = {
    vouchersConsidered: byVoucher.size,
    frozen: 0,
    propagated: 0,
    writesDeferred: 0,
    routersRead: 0,
    routerErrors: [],
  };
  if (byVoucher.size === 0) return result;

  const routerRows = await db.select().from(routers);
  const routerById = new Map(routerRows.map((r) => [r.id, r]));

  // ── Passe 1 : lire les users (name → {id, wall}) de chaque routeur concerné.
  const routerUsers = new Map<string, Map<string, UserRow>>();
  await pool([...routerSet], 4, async (routerId) => {
    const router = routerById.get(routerId);
    if (!router) return;
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch (e) {
      result.routerErrors.push(
        `${router.name} (lecture) : ${e instanceof Error ? e.message : "injoignable"}`,
      );
      return;
    }
    try {
      const users = await client
        .talk(["/ip/hotspot/user/print"])
        .catch(() => [] as Record<string, string>[]);
      const map = new Map<string, UserRow>();
      for (const u of users) {
        const name = u["name"];
        const id = u[".id"];
        if (!name || !id) continue;
        const comment = u["comment"] ?? "";
        map.set(name, { id, wall: comment ? parseExpiryComment(comment) : null, comment });
      }
      routerUsers.set(routerId, map);
      result.routersRead += 1;
    } finally {
      client.close();
    }
  });

  // ── Calcul des gels + écritures à propager, groupées par routeur.
  type Write = { userId: string; comment: string };
  const writesByRouter = new Map<string, Write[]>();
  const dbUpdates: { voucherId: string; expiresAt: Date; firstLoginAt: Date | null }[] = [];

  for (const v of byVoucher.values()) {
    // Plus tôt commentaire parmi les routeurs lus = ancre de 1ʳᵉ connexion.
    let frozen: Wall | null = null;
    for (const routerId of v.routerIds) {
      const wall = routerUsers.get(routerId)?.get(v.username)?.wall;
      if (wall && (!frozen || wallKey(wall) < wallKey(frozen))) frozen = wall;
    }
    if (!frozen) continue; // aucune connexion détectée nulle part

    const expiresDate = wallToDate(frozen);
    // L'expiration EST « début + durée » : le début s'en déduit exactement, il
    // n'est pas estimé. Sans durée exploitable (forfait élagué ET nom de profil
    // non parsable), on ne l'invente pas — le commentaire reste l'expiration seule.
    const startDate = v.pkg ? new Date(expiresDate.getTime() - durationToMs(v.pkg)) : null;
    const startWall = startDate ? dateToWall(startDate) : null;

    // Gel en base (une seule fois — quand pas encore figé, ou valeur différente).
    if (!v.expiresAt || v.expiresAt.getTime() !== expiresDate.getTime()) {
      dbUpdates.push({ voucherId: v.voucherId, expiresAt: expiresDate, firstLoginAt: startDate });
      result.frozen += 1;
    }

    // Propagation : chaque routeur du voucher dont le commentaire diffère de la
    // chaîne voulue (expiration + date de début). Comparaison sur la chaîne
    // entière : un ticket à la bonne date mais sans son début doit être complété.
    for (const routerId of v.routerIds) {
      const user = routerUsers.get(routerId)?.get(v.username);
      if (!user) continue; // user absent / routeur non lu
      const desired = buildUserComment(frozen, startWall, user.comment);
      if (user.comment === desired) continue; // déjà bon
      const list = writesByRouter.get(routerId) ?? [];
      list.push({ userId: user.id, comment: desired });
      writesByRouter.set(routerId, list);
    }
  }

  // ── Plafond : on garde les MAX_WRITES_PER_RUN premières, le reste attend le
  //    prochain passage (dans 2 min). Réparti routeur par routeur plutôt qu'en
  //    vidant le premier de la liste — sinon un routeur à 5 000 tickets
  //    monopoliserait le budget et les autres n'avanceraient jamais.
  let budget = MAX_WRITES_PER_RUN;
  const totalWrites = [...writesByRouter.values()].reduce((n, w) => n + w.length, 0);
  if (totalWrites > budget) {
    const share = Math.max(1, Math.floor(budget / writesByRouter.size));
    for (const [routerId, list] of writesByRouter) {
      const take = Math.min(share, list.length, budget);
      writesByRouter.set(routerId, list.slice(0, take));
      budget -= take;
    }
    result.writesDeferred = totalWrites - (MAX_WRITES_PER_RUN - budget);
  }

  // ── Persistance base.
  for (const u of dbUpdates) {
    await db
      .update(vouchers)
      .set({ expiresAt: u.expiresAt, firstLoginAt: u.firstLoginAt })
      .where(eq(vouchers.id, u.voucherId));
  }

  // ── Passe 2 : appliquer les commentaires sur les routeurs.
  await pool([...writesByRouter.keys()], 4, async (routerId) => {
    const router = routerById.get(routerId);
    const writes = writesByRouter.get(routerId);
    if (!router || !writes || writes.length === 0) return;
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch (e) {
      result.routerErrors.push(
        `${router.name} (écriture) : ${e instanceof Error ? e.message : "injoignable"}`,
      );
      return;
    }
    try {
      for (const w of writes) {
        await client
          .talk(["/ip/hotspot/user/set", `=.id=${w.userId}`, `=comment=${w.comment}`])
          .then(() => {
            result.propagated += 1;
          })
          .catch((e) => {
            result.routerErrors.push(
              `${router.name} / set : ${e instanceof Error ? e.message : "échec"}`,
            );
          });
      }
    } finally {
      client.close();
    }
  });

  return result;
}
