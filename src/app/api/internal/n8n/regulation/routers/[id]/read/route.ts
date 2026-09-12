import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { readRegulationInputs } from "@/lib/mikrotik/regulation";
import { loadRegulatedRouter, n8nAuthorized, unauthorized } from "@/lib/mikrotik/regulation-api";

export const dynamic = "force-dynamic";

/** POST — relève compteurs WAN et sessions actives sur le routeur (via le tunnel). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!n8nAuthorized(request)) return unauthorized();
  const { id } = await params;
  const row = await loadRegulatedRouter(id);
  if (!row) return Response.json({ error: "Routeur non régulé." }, { status: 404 });

  let client;
  try {
    client = await connectToRouter(row.router, 20000);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Routeur injoignable." },
      { status: 503 },
    );
  }
  try {
    const inputs = await readRegulationInputs(client, row.regulation.state?.wanInterface ?? null);
    if (inputs.counters === null) {
      return Response.json({ error: "Interface WAN introuvable." }, { status: 422 });
    }
    return Response.json({ at: new Date().toISOString(), ...inputs });
  } finally {
    client.close();
  }
}
