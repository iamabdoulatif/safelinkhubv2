// L'agent vérifie son code de liaison et récupère l'organisation rattachée.
import { resolveAgentLinkFromRequest } from "@/lib/agent-link/service";

export async function GET(request: Request) {
  const link = await resolveAgentLinkFromRequest(request);
  if (!link.ok) {
    return Response.json({ error: link.reason === "expired" ? "Code expiré : régénérez-en un depuis le SaaS." : "Code de liaison invalide." }, { status: 401 });
  }
  return Response.json({ orgId: link.orgId, orgName: link.orgName });
}
