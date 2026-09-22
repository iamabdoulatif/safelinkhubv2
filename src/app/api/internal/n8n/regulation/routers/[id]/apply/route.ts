import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  portalOrders,
  routerRegulation,
  routerRegulationEvents,
  vouchers,
  type RegulationState,
} from "@/lib/db/schema";
import { sendOrgSms } from "@/lib/sms/send";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import {
  applyRegulation,
  type RegulationBlock,
  type RegulationSuspension,
  type RegulationThrottle,
} from "@/lib/mikrotik/regulation";
import { loadRegulatedRouter, n8nAuthorized, unauthorized } from "@/lib/mikrotik/regulation-api";

export const dynamic = "force-dynamic";

type ApplyBody = {
  limit: string;
  blocks?: RegulationBlock[];
  throttles?: RegulationThrottle[];
  suspensions?: RegulationSuspension[];
  /** Avertissements à envoyer AVANT la suspension (« encore 1 dépassement »). */
  warnings?: { user: string; remaining: number }[];
  state: RegulationState;
  watch?: Record<string, unknown>;
  events?: { kind: string; payload: unknown }[];
};

const LIMIT_RE = /^(\d+(?:\.\d+)?[kMG]?|0)\/(\d+(?:\.\d+)?[kMG]?|0)$/;

/**
 * POST — applique la décision de n8n (bride + blocages) et mémorise son état.
 * L'état est écrit MÊME si le routeur ne répond pas : la décision reste vraie,
 * seule la pose a échoué, et n8n réessaie au passage suivant.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!n8nAuthorized(request)) return unauthorized();
  const { id } = await params;
  const row = await loadRegulatedRouter(id);
  if (!row) return Response.json({ error: "Routeur non régulé." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as ApplyBody | null;
  if (!body || !LIMIT_RE.test(body.limit ?? "") || !body.state?.decision) {
    return Response.json({ error: "Corps invalide : limit « up/down » et state.decision requis." }, { status: 400 });
  }
  const blocks = (body.blocks ?? []).filter((b) => /^\d+\.\d+\.\d+\.\d+$/.test(b.address ?? ""));

  const db = getDb();
  await db
    .update(routerRegulation)
    .set({
      state: body.state,
      watch: (body.watch ?? row.regulation.watch ?? {}) as never,
      updatedAt: new Date(),
    })
    .where(eq(routerRegulation.routerId, id));
  if (body.events?.length) {
    await db.insert(routerRegulationEvents).values(
      body.events.map((e) => ({ routerId: id, kind: String(e.kind), payload: e.payload ?? {} })),
    );
  }

  let client;
  try {
    client = await connectToRouter(row.router, 20000);
  } catch (err) {
    return Response.json(
      { applied: false, error: err instanceof Error ? err.message : "Routeur injoignable." },
      { status: 503 },
    );
  }
  try {
    const result = await applyRegulation(client, {
      limit: body.limit,
      blocks,
      throttles: body.throttles ?? [],
      throttleLimit: row.regulation.abuseThrottleLimit,
      suspensions: body.suspensions ?? [],
      profileThrottlePct: row.regulation.profileThrottlePct,
      profileLimits: body.state.profileLimits ?? row.regulation.state?.profileLimits,
    });
    // La mémoire des rate-limits d'origine vit dans l'état : n8n la renvoie
    // telle quelle au passage suivant, on la met à jour après la pose.
    await db
      .update(routerRegulation)
      .set({ state: { ...body.state, profileLimits: result.profileLimits } })
      .where(eq(routerRegulation.routerId, id));
    // Le code suspendu sur le routeur l'est aussi dans le parc : sans ça, une
    // restauration ou une resynchro le remettrait en service.
    const suspendus = (body.suspensions ?? []).map((s) => s.user);
    if (suspendus.length > 0) {
      await db
        .update(vouchers)
        .set({ status: "SUSPENDED" })
        .where(and(eq(vouchers.orgId, row.router.orgId), inArray(vouchers.username, suspendus)))
        .catch(() => {});
    }
    const notifies = await notifierClients(
      row.router.orgId,
      [
        ...(body.warnings ?? []).map((w) => ({ user: w.user, remaining: w.remaining })),
        ...suspendus.map((user) => ({ user, remaining: 0 })),
      ],
    );
    return Response.json({ applied: true, ...result, notifies });
  } catch (err) {
    return Response.json(
      { applied: false, error: err instanceof Error ? err.message : "Application impossible." },
      { status: 502 },
    );
  } finally {
    client.close();
  }
}


/**
 * Prévient le client par SMS — sur le numéro qui a ACHETÉ le code au portail,
 * seul numéro que la plateforme connaisse (un code vendu par un agent n'en a
 * pas : on ne prétend pas l'avoir joint). Best-effort : un SMS qui ne part pas
 * n'annule ni le bridage ni la suspension.
 */
async function notifierClients(
  orgId: string,
  cibles: { user: string; remaining: number }[],
): Promise<number> {
  if (cibles.length === 0) return 0;
  const db = getDb();
  let envoyes = 0;
  for (const cible of cibles) {
    try {
      const [ligne] = await db
        .select({ phone: portalOrders.phone })
        .from(portalOrders)
        .innerJoin(vouchers, eq(vouchers.id, portalOrders.voucherId))
        .where(and(eq(vouchers.username, cible.user), eq(vouchers.orgId, orgId)))
        .limit(1);
      if (!ligne?.phone) continue;
      const contenu =
        cible.remaining > 0
          ? `Votre code ${cible.user} telecharge trop vite : debit reduit. Encore ${cible.remaining} depassement(s) et il sera suspendu definitivement.`
          : `Votre code ${cible.user} est suspendu definitivement apres 10 depassements de telechargement.`;
      const res = await sendOrgSms({ orgId, to: ligne.phone, content: contenu });
      if (res && !("error" in res && res.error)) envoyes++;
    } catch {
      /* best-effort */
    }
  }
  return envoyes;
}
