import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { AUTOPILOT_GROUPS, orgForToken, validAccounts } from "@/lib/autopilot/link";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { autopilotCallAllowed, notFound } from "../guard";

export const dynamic = "force-dynamic";

/**
 * POST { routerId, accounts: [{ name, password, access: read|write }] }
 * (en-tête x-slh-link) : crée ou met à jour sur le routeur les comptes
 * RouterOS d'Auto-Pilot, par la connexion API que SafeLinkHub détient déjà —
 * aucun mot de passe dans un script collé. Comptes limités au réseau du
 * tunnel (10.66.0.0/24), groupes dédiés autopilot-read / autopilot-write.
 */
export async function POST(request: Request) {
  if (!autopilotCallAllowed(request)) return notFound();
  const org = await orgForToken(request.headers.get("x-slh-link") ?? "");
  if (!org) return Response.json({ error: "Liaison inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { routerId?: unknown; accounts?: unknown } | null;
  const accounts = validAccounts(body?.accounts);
  if (typeof body?.routerId !== "string" || !accounts) return Response.json({ error: "Requête invalide." }, { status: 400 });

  const [router] = await getDb()
    .select()
    .from(routers)
    .where(and(eq(routers.id, body.routerId), eq(routers.orgId, org.orgId)))
    .limit(1);
  if (!router) return Response.json({ error: "Routeur introuvable dans l'organisation liée." }, { status: 404 });

  let client;
  try {
    client = await connectToRouter(router, 20000, 2);
  } catch (e) {
    return Response.json({ error: `Routeur injoignable : ${e instanceof Error ? e.message : "connexion échouée"}` }, { status: 502 });
  }
  try {
    for (const g of Object.values(AUTOPILOT_GROUPS)) {
      const [row] = await client.talk(["/user/group/print", `?name=${g.name}`]);
      if (row?.[".id"]) await client.talk(["/user/group/set", `=.id=${row[".id"]}`, `=policy=${g.policy}`]);
      else await client.talk(["/user/group/add", `=name=${g.name}`, `=policy=${g.policy}`]);
    }
    for (const a of accounts) {
      const fields = [`=group=${AUTOPILOT_GROUPS[a.access].name}`, `=password=${a.password}`, "=address=10.66.0.0/24", "=comment=SafeLink Auto-Pilot"];
      const [row] = await client.talk(["/user/print", `?name=${a.name}`]);
      if (row?.[".id"]) await client.talk(["/user/set", `=.id=${row[".id"]}`, ...fields]);
      else await client.talk(["/user/add", `=name=${a.name}`, ...fields]);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: `Le routeur a refusé : ${e instanceof Error ? e.message : "erreur"}` }, { status: 502 });
  } finally {
    client.close();
  }
}
