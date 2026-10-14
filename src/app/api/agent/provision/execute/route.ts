// Provisioning agent — exécuter l'auto-setup ÉPROUVÉ (SaaS) sur le routeur mis
// en ligne par l'agent. Réutilise le même moteur asynchrone que le SaaS.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { resolveAgentLinkFromRequest } from "@/lib/agent-link/service";
import { enqueueAgentAutoSetupJob } from "@/lib/mikrotik/autosetup-job-actions";
import type { HotspotStackOptions } from "@/lib/mikrotik/container-setup";

export async function POST(request: Request) {
  const link = await resolveAgentLinkFromRequest(request);
  if (!link.ok) return Response.json({ error: "Code invalide." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { routerId?: string };
  if (!body.routerId) return Response.json({ error: "routerId requis." }, { status: 400 });

  const db = getDb();
  const [router] = await db
    .select({ id: routers.id, orgId: routers.orgId, status: routers.status, config: routers.lastAutoSetupConfig })
    .from(routers)
    .where(and(eq(routers.id, body.routerId), eq(routers.orgId, link.orgId)))
    .limit(1);
  if (!router) return Response.json({ error: "Routeur introuvable pour cette organisation." }, { status: 404 });
  if (!router.config) return Response.json({ error: "Plan d'auto-setup absent : relancez depuis l'agent." }, { status: 409 });
  if (router.status !== "online") {
    return Response.json({ error: "Routeur pas encore en ligne : attendez la fin de la mise en ligne.", status: router.status }, { status: 425 });
  }

  const result = await enqueueAgentAutoSetupJob(link.orgId, router.id, router.config as HotspotStackOptions);
  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ jobId: "jobId" in result ? result.jobId : null, started: true });
}
