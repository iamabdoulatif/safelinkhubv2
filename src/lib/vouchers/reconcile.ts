import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vouchers, voucherRouters, routers, packages } from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import type { RouterOSClient } from "@/lib/mikrotik/client";
import { durationToMs, type PackageDuration } from "./expiry";

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

type Wall = { y: number; mon: number; d: number; h: number; mi: number; s: number };

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

// On traite les composantes comme de l'« heure murale » : parse et format via
// UTC pour un aller-retour exact. L'affichage admin (Intl sans timezone sur le
// runtime UTC) montre donc les mêmes composantes que le routeur. Hypothèse :
// les routeurs d'une org partagent le même fuseau (zones WiFi d'un même pays).
export function wallToDate(w: Wall): Date {
  return new Date(Date.UTC(w.y, w.mon, w.d, w.h, w.mi, w.s));
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

type UserRow = { id: string; wall: Wall | null };

export type ReconcileResult = {
  vouchersConsidered: number;
  frozen: number; // vouchers dont l'expiration a été figée en base ce run
  propagated: number; // commentaires (re)posés sur des routeurs
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
      durationValue: packages.durationValue,
      durationUnit: packages.durationUnit,
      billingStartsOn: packages.billingStartsOn,
    })
    .from(voucherRouters)
    .innerJoin(vouchers, eq(voucherRouters.voucherId, vouchers.id))
    .leftJoin(packages, eq(vouchers.packageId, packages.id));
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
      : null;
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
        map.set(name, { id, wall: u["comment"] ? parseExpiryComment(u["comment"]) : null });
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
    const desired = formatExpiryComment(frozen);

    // Gel en base (une seule fois — quand pas encore figé, ou valeur différente).
    if (!v.expiresAt || v.expiresAt.getTime() !== expiresDate.getTime()) {
      const firstLoginAt = v.pkg ? new Date(expiresDate.getTime() - durationToMs(v.pkg)) : null;
      dbUpdates.push({ voucherId: v.voucherId, expiresAt: expiresDate, firstLoginAt });
      result.frozen += 1;
    }

    // Propagation : chaque routeur du voucher dont le commentaire diffère.
    const frozenKey = wallKey(frozen);
    for (const routerId of v.routerIds) {
      const user = routerUsers.get(routerId)?.get(v.username);
      if (!user) continue; // user absent / routeur non lu
      if (user.wall && wallKey(user.wall) === frozenKey) continue; // déjà bon
      const list = writesByRouter.get(routerId) ?? [];
      list.push({ userId: user.id, comment: desired });
      writesByRouter.set(routerId, list);
    }
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
