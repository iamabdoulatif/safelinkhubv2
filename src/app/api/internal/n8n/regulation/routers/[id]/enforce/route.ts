import { n8nAuthorized, unauthorized } from "@/lib/mikrotik/regulation-api";
import { runStarlinkFup } from "@/lib/mikrotik/starlink-fup-service";
import { storeFupObservation } from "@/lib/mikrotik/starlink-fup-observation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** The authenticated caller cannot activate observation sites or submit router commands. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!n8nAuthorized(request)) return unauthorized();
  const { id } = await params;
  try {
    const body = await request.json();
    if (body?.dryRun === true || body?.observationOnly === true) return Response.json({ applied: false, changed: false, observationOnly: true });
    if (typeof body?.execute !== "boolean") return Response.json({ error: "execute explicite et observation requis." }, { status: 400 });
    const observedChange = await storeFupObservation(id, body.observation);
    if (!body.execute) return Response.json({ applied: false, changed: false, observed: true });
    const result = await runStarlinkFup(id);
    return Response.json({ ...result, changed: result.applied && (result.changed || observedChange),
      email: { subject: "[FUP] Régulation Starlink", text: result.telegram } });
  }
  catch (e) { return Response.json({ applied: false, error: e instanceof Error ? e.message : "Application FUP impossible." }, { status: 409 }); }
}
