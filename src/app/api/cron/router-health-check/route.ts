import { NextRequest, after } from "next/server";
import { asc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { collectTrafficHistory } from "@/lib/mikrotik/traffic-collector";
import { createHealthSchedule } from "@/lib/mikrotik/health-schedule";
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
/* Appelée toutes les 5 min par le cron du VPS. Un passage complet dépassait
   5 min (59 routeurs, hors-ligne lents) : le client abandonnait chaque nuit
   sur « fetch failed ». On répond donc tout de suite et on travaille en
   arrière-plan, un seul passage à la fois, dans un budget de 3 min : avec la
   traîne des dernières sondes, il tient dans les 5 min entre deux ticks. */
const BUDGET_MS = 3 * 60 * 1000;
const schedule = createHealthSchedule(async () => {
  const traffic = await collectTrafficHistory().catch(error => {
    console.error(JSON.stringify({ msg: "traffic-history", error: error instanceof Error ? error.message : "Collection failed" }));
    return { error: "Collection failed" };
  });
  console.log(JSON.stringify({ msg: "traffic-history", ...traffic }));
}, async () => {
  const summary = await runHealthCheck();
  console.log(JSON.stringify({ msg: "router-health-check", ...summary }));
});

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Keep separate in-process reservations (single production container).
  // The collector also has a DB advisory lock and slot deduplication.
  if (!schedule(after)) return Response.json({ skipped: "already running" }, { status: 202 });
  return Response.json({ started: true }, { status: 202 });
}

async function runHealthCheck(budgetMs = BUDGET_MS) {
  const deadline = Date.now() + Math.min(BUDGET_MS, budgetMs);
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
  // load flat. Passé à 6 le 11/10/2026 : à 4, un passage de 4 min ne
  // sondait que 34 des 59 routeurs.
  const CONCURRENCY = 6;
  const results: Array<{ id: string; name: string; success: boolean; error?: string }> = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
      // Passé le budget, on ne lance plus de sonde : les hors-ligne restants,
      // triés du sync le plus ancien, passent en tête au prochain tour.
      while (cursor < candidates.length && Date.now() < deadline) {
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

  return {
    candidates: candidates.length,
    checked: results.length,
    offline: results.filter((r) => !r.success).map((r) => r.name),
    mndp,
  };
}
