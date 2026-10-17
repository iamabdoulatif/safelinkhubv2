import { n8nAuthorized, unauthorized } from "@/lib/mikrotik/regulation-api";
import { storeFupObservation } from "@/lib/mikrotik/starlink-fup-observation";

export const dynamic = "force-dynamic";

/** Separate observation storage; never imports a router command adapter. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!n8nAuthorized(request)) return unauthorized();
  const { id } = await params;
  try {
    const changed = await storeFupObservation(id, await request.json());
    return Response.json({ observed: true, applied: false, changed });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Observation invalide." }, { status: 400 }); }
}
