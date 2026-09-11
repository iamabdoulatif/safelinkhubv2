import { NextRequest } from "next/server";
import { asc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { syncRouterStats } from "@/lib/mikrotik/router-sync";
import { syncMndpAnnouncementsForAllOrgs } from "@/lib/mikrotik/mndp-sync";

export const maxDuration = 300;

/**
 * Runs on a Vercel Cron schedule (see vercel.json) to catch routers whose
 * WireGuard/OpenVPN tunnel has silently dropped — e.g. a stale WireGuard
 * handshake — without anyone visiting a page that would trigger a sync.
 * syncRouterStats already flips status to "offline" on failure; this just
 * makes sure that check actually runs periodically instead of only when an
 * admin happens to load /admin/router.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb();
  // "offline" is included so a router that got marked offline by a transient
  // failure (some devices' API takes >10s under hotspot load) heals itself on
  // the next run instead of staying offline until an admin loads a page.
  // ORDRE : les routeurs en ligne d'abord, puis les hors-ligne du sync le plus
  // ancien au plus récent. Un routeur hors ligne coûte 2 × 30 s à l'un des 4
  // travailleurs (deux sondes avant de le déclarer perdu) : avec une part du
  // parc hors ligne, 47 routeurs ne tiennent pas dans les 300 s de la route,
  // et une liste toujours parcourue dans le même ordre refaisait les mêmes
  // vingt à chaque exécution — mesuré le 11/09/2026, 20/47. En ligne d'abord,
  // la sonde rapide (et la veille du portail) couvre tout ce qui sert des
  // clients à chaque passage ; le reste du budget balaie les hors-ligne par
  // rotation, et les exécutions successives finissent par tous les revoir.
  const candidates = await db
    .select({ id: routers.id, name: routers.name })
    .from(routers)
    .where(inArray(routers.status, ["online", "installing", "offline"]))
    .orderBy(sql`case when ${routers.status} = 'online' then 0 else 1 end`, asc(routers.lastSyncAt));

  // Probes go through a single relay host (one SSH connection each), so an
  // unbounded Promise.all stampedes it — 12 concurrent SSH handshakes on the
  // 1-vCPU relay starve each other into spurious "Read timed out" failures
  // that mark healthy routers offline. A small worker pool keeps the relay
  // load flat; 4 × 30s worst-case waves stay well under maxDuration.
  const CONCURRENCY = 4;
  const results: Array<{ id: string; name: string; success: boolean; error?: string }> = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const r = candidates[cursor++];
        // MikroTik's API gets erratically slow under hotspot load (peak-hour
        // probes rotate randomly between OK and >30s), so one failed probe
        // says little — only mark offline after a second miss in a row.
        let result = await syncRouterStats(r.id, {
          timeoutMs: 30000,
          markOfflineOnFailure: false,
        });
        if (!result.success) {
          result = await syncRouterStats(r.id, {
            timeoutMs: 30000,
            markOfflineOnFailure: true,
          });
        }
        results.push({ id: r.id, name: r.name, success: result.success, error: result.error });
      }
    }),
  );

  const mndp = await syncMndpAnnouncementsForAllOrgs().catch((err) => ({
    error: err instanceof Error ? err.message : "MNDP sync failed",
  }));

  return Response.json({
    checked: results.length,
    offline: results.filter((r) => !r.success).length,
    results,
    mndp,
  });
}
