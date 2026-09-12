import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRegulation, routerRegulationEvents, type RegulationState } from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { applyRegulation, type RegulationBlock } from "@/lib/mikrotik/regulation";
import { loadRegulatedRouter, n8nAuthorized, unauthorized } from "@/lib/mikrotik/regulation-api";

export const dynamic = "force-dynamic";

type ApplyBody = {
  limit: string;
  blocks?: RegulationBlock[];
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
    const result = await applyRegulation(client, { limit: body.limit, blocks });
    return Response.json({ applied: true, ...result });
  } catch (err) {
    return Response.json(
      { applied: false, error: err instanceof Error ? err.message : "Application impossible." },
      { status: 502 },
    );
  } finally {
    client.close();
  }
}
