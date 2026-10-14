// Provisioning agent — statut du paiement PAR NUMÉRO DE SÉRIE.
// L'agent interroge jusqu'à « payé » (webhook GeniusPay → status 'approved').
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { autoSetupAuthorizations } from "@/lib/db/schema";
import { resolveAgentLinkFromRequest } from "@/lib/agent-link/service";

export async function GET(request: Request) {
  const link = await resolveAgentLinkFromRequest(request);
  if (!link.ok) return Response.json({ error: "Code invalide." }, { status: 401 });
  const serial = new URL(request.url).searchParams.get("serial")?.trim();
  if (!serial) return Response.json({ error: "Numéro de série requis." }, { status: 400 });

  const [row] = await getDb()
    .select({ status: autoSetupAuthorizations.status, consumedAt: autoSetupAuthorizations.consumedAt })
    .from(autoSetupAuthorizations)
    .where(and(eq(autoSetupAuthorizations.orgId, link.orgId), eq(autoSetupAuthorizations.serialNumber, serial)))
    .orderBy(desc(autoSetupAuthorizations.createdAt))
    .limit(1);

  const paid = row?.status === "approved" && !row.consumedAt;
  return Response.json({ paid, status: row?.status ?? "none" });
}
