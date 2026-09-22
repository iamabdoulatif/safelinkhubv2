import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  routerRegulation,
  routerRegulationEvents,
  routers,
  vouchers,
  type RegulationWatchEntry,
} from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { applyRegulation, readRegulationInputs } from "@/lib/mikrotik/regulation";
import { decideRegulation } from "@/lib/mikrotik/regulation-decision";
import { notifierClients } from "@/lib/mikrotik/regulation-notify";
import type { RouterOSClient } from "@/lib/mikrotik/client";

export const maxDuration = 300;

/**
 * RÉGULATION DU TRAFIC — le passage périodique, désormais DANS la plateforme.
 *
 * Elle était pilotée par un workflow n8n Cloud toutes les 5 minutes. Le
 * 22/09/2026 ce compte a cessé d'exécuter quoi que ce soit — quota mensuel
 * épuisé — et la régulation de tout le parc s'est arrêtée seize heures durant
 * sans qu'aucune alerte ne parte : le seul signe visible était l'absence de
 * nouveaux relevés. Un mécanisme qui bride le débit de milliers de clients et
 * suspend des codes payants ne peut pas dépendre d'un tiers qui s'arrête en
 * silence.
 *
 * Appelée par le cron du VPS (`slh-cron regulation`, toutes les 5 min), qui
 * frappe le conteneur en direct : ni Cloudflare ni sa coupure à ~100 s.
 *
 * Budget de temps borné, et un PETIT groupe de travailleurs. En série, un
 * passage ne couvrait que onze routeurs en 240 s (~22 s chacun : ouverture du
 * tunnel, lectures, pose) — le parc n'était donc revu que toutes les vingt-cinq
 * minutes, cinq fois moins souvent que la cadence annoncée. Quatre travailleurs
 * suffisent à tenir les cinq minutes ; au-delà, les sessions SSH se disputent
 * le relais (1 vCPU) et se bornent mutuellement en délais d'attente — c'est la
 * limite déjà retenue pour le contrôle de santé.
 *
 * Ce qui reste couvert si le parc dépasse le budget : la file est ordonnée du
 * relevé le plus ancien au plus récent, donc le passage suivant reprend ceux
 * qui ont été laissés.
 */
const BUDGET_MS = 240_000;
const CONCURRENCE = 4;

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const lignes = await db
    .select({ router: routers, regulation: routerRegulation })
    .from(routerRegulation)
    .innerJoin(routers, eq(routers.id, routerRegulation.routerId))
    .where(eq(routerRegulation.enabled, true));

  // Le plus anciennement relevé d'abord : sur un parc plus grand que le budget,
  // c'est ce qui garantit que tout le monde finit par passer.
  const file = lignes
    .filter((l) => l.router.status !== "pending")
    .sort((a, b) => (a.regulation.updatedAt?.getTime() ?? 0) - (b.regulation.updatedAt?.getTime() ?? 0));

  const echeance = Date.now() + BUDGET_MS;
  const bilan = {
    traites: 0,
    injoignables: [] as string[],
    changes: [] as string[],
    brides: 0,
    bloques: 0,
    suspendus: [] as string[],
    restants: 0,
  };

  let curseur = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCE, file.length) }, async () => {
      while (curseur < file.length) {
        if (Date.now() > echeance) break;
        const ligne = file[curseur++];
        await traiter(ligne);
      }
    }),
  );
  bilan.restants = Math.max(0, file.length - curseur);

  return Response.json({ ok: true, ...bilan });

  async function traiter(ligne: (typeof file)[number]) {
    const { router, regulation } = ligne;

    let client: RouterOSClient;
    try {
      client = await connectToRouter(router, 12000);
    } catch {
      bilan.injoignables.push(router.name);
      return;
    }

    try {
      const lu = await readRegulationInputs(client, regulation.state?.wanInterface ?? null, 12000);
      const decision = decideRegulation({
        policy: {
          softCapMb: regulation.softCapMb,
          hardCapMb: regulation.hardCapMb,
          safety: Number(regulation.safety),
          dayCriticalRatio: Number(regulation.dayCriticalRatio),
          blockLimit: regulation.blockLimit,
          abuseThresholdMb: regulation.abuseThresholdMb,
          abuseBlockMinutes: regulation.abuseBlockMinutes,
          abuseMaxOffenses: regulation.abuseMaxOffenses,
          abuseThrottleLimit: regulation.abuseThrottleLimit,
          profileThrottlePct: regulation.profileThrottlePct,
        },
        billingCycleDay: router.billingCycleDay ?? 1,
        state: regulation.state ?? null,
        watch: (regulation.watch ?? {}) as Record<string, RegulationWatchEntry>,
        counters: lu.counters,
        wanInterface: lu.wanInterface,
        active: lu.active,
        at: new Date(),
      });

      // L'ÉTAT D'ABORD, la pose ensuite : si le routeur lâche en cours de
      // route, la décision reste vraie et le delta n'est pas recompté au
      // passage suivant — c'est ce qui rend le compteur mensuel fiable.
      await db
        .update(routerRegulation)
        .set({
          state: decision.state,
          watch: decision.watch as never,
          updatedAt: new Date(),
        })
        .where(eq(routerRegulation.routerId, router.id));

      const result = await applyRegulation(client, {
        limit: decision.limit,
        blocks: decision.blocks,
        throttles: decision.throttles,
        throttleLimit: regulation.abuseThrottleLimit,
        suspensions: decision.suspensions,
        profileThrottlePct: regulation.profileThrottlePct,
        profileLimits: decision.state.profileLimits,
      });
      await db
        .update(routerRegulation)
        .set({ state: { ...decision.state, profileLimits: result.profileLimits } })
        .where(eq(routerRegulation.routerId, router.id));

      const suspendus = decision.suspensions.map((s) => s.user);
      if (suspendus.length > 0) {
        await db
          .update(vouchers)
          .set({ status: "SUSPENDED" })
          .where(and(eq(vouchers.orgId, router.orgId), inArray(vouchers.username, suspendus)))
          .catch(() => {});
      }

      const avis = await notifierClients(router.orgId, [
        ...decision.warnings,
        ...suspendus.map((user) => ({ user, remaining: 0 })),
      ]);

      const journal = [
        ...decision.events,
        ...avis.map((a) => ({
          kind: "notice",
          payload: { user: a.user, remaining: a.remaining, notified: a.notified, phone: a.phone },
        })),
      ];
      if (journal.length > 0) {
        await db
          .insert(routerRegulationEvents)
          .values(journal.map((e) => ({ routerId: router.id, kind: e.kind, payload: e.payload })))
          .catch(() => {});
      }

      bilan.traites++;
      bilan.brides += result.throttled;
      bilan.bloques += result.blocked;
      if (suspendus.length > 0) bilan.suspendus.push(...suspendus);
      if (decision.changed) bilan.changes.push(`${router.name} : ${decision.summary}`);
    } catch {
      bilan.injoignables.push(router.name);
    } finally {
      client.close();
    }
  }
}
