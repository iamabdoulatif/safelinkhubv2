import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { readRegulationInputs, readRegulationSessions } from "@/lib/mikrotik/regulation";
import { loadRegulatedRouter, n8nAuthorized, unauthorized } from "@/lib/mikrotik/regulation-api";
import { calculateFupPool } from "@/lib/mikrotik/starlink-fup-pool";
import { readStarlinkFup } from "@/lib/mikrotik/starlink-fup-reader";
import { recentFupMeasurements } from "@/lib/mikrotik/starlink-fup-recent";
import { withCollectionDeadline, collectionFailure } from "@/lib/mikrotik/regulation-collection";

export const dynamic = "force-dynamic";

/** POST — relève compteurs WAN et sessions actives sur le routeur (via le tunnel). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!n8nAuthorized(request)) return unauthorized();
  const { id } = await params;
  const row = await loadRegulatedRouter(id);
  if (!row) return Response.json({ error: "Routeur non régulé." }, { status: 404 });

  const startedAt = Date.now();
  try {
    return await withCollectionDeadline(
      () => connectToRouter(row.router, 10000, 1),
      async client => {
        if (row.regulation.fupLinks?.length) {
          const recent = recentFupMeasurements(row.regulation.fupLinks, row.regulation.fupLedger ?? {}, new Date());
          const links = recent ?? await readStarlinkFup(client, id, row.regulation.fupLinks, 10000);
          // WAN counters were already read separately above. Do not read both again.
          const active = await readRegulationSessions(client, 10000);
          return Response.json({ at: new Date().toISOString(), active, links, source: recent ? "recent_server_sample" : "live_router_sample",
            ...(row.regulation.fupPooled ? {pool: calculateFupPool(row.regulation.fupLinks, Object.fromEntries(links.map(l => [l.id, l])), new Date())} : {}) });
        }
        const inputs = await readRegulationInputs(client, row.regulation.state?.wanInterface ?? null, 10000);
        if (inputs.counters === null) return Response.json({ code: "FUP_WAN_MISSING", error: "Interface WAN introuvable." }, { status: 422 });
        return Response.json({ at: new Date().toISOString(), ...inputs });
      },
    );
  } catch (error) {
    const failure = collectionFailure(error);
    console.warn(JSON.stringify({msg:"fup-collection-failed",routerId:id,code:failure.code,elapsedMs:Date.now()-startedAt}));
    return Response.json(failure, { status: 503, headers: {"Retry-After":"60"} });
  }
}
