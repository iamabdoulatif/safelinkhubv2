import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerDualwanJobs } from "@/lib/db/schema";
import { n8nAuthorized, unauthorized } from "@/lib/mikrotik/regulation-api";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["ok", "dry_run", "error"]);

/**
 * POST — notification finale du workflow dual WAN (docs/n8n/dualwan.md,
 * « Notification renvoyée »). Le job est identifié par l'URL de callback que
 * la plateforme a elle-même fournie ; le router_id du corps doit concorder.
 */
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!n8nAuthorized(request)) return unauthorized();
  const { jobId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ error: "Job invalide." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { router_id?: string; status?: string } | null;
  if (!body || !STATUSES.has(String(body.status))) return Response.json({ error: "Statut attendu : ok | dry_run | error." }, { status: 400 });

  const db = getDb();
  const [job] = await db.select().from(routerDualwanJobs).where(eq(routerDualwanJobs.id, jobId)).limit(1);
  if (!job || job.routerId !== body.router_id) return Response.json({ error: "Job introuvable." }, { status: 404 });
  // Première notification gagnante : n8n peut rappeler deux fois (bilan puis branche Échec).
  if (job.status !== "running") return Response.json({ ok: true, ignored: true });

  await db
    .update(routerDualwanJobs)
    .set({ status: body.status, result: body, finishedAt: new Date() })
    .where(eq(routerDualwanJobs.id, jobId));
  return Response.json({ ok: true });
}
