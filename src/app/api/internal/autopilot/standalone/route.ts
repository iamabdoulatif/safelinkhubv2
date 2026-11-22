import { provisionStandaloneOrg } from "@/lib/autopilot/link";
import { autopilotCallAllowed, notFound } from "../guard";

export const dynamic = "force-dynamic";

/**
 * POST { ref, label } → { token, orgName } : organisation technique pour un
 * espace Auto-Pilot dont l'utilisateur n'a pas de compte SafeLinkHub.
 * `ref` est une référence opaque de l'espace (hachée côté Auto-Pilot).
 */
export async function POST(request: Request) {
  if (!autopilotCallAllowed(request)) return notFound();
  const body = (await request.json().catch(() => null)) as { ref?: unknown; label?: unknown } | null;
  const ref = typeof body?.ref === "string" ? body.ref : "";
  const label = typeof body?.label === "string" ? body.label : "";
  if (!/^[a-f0-9]{32,64}$/.test(ref) || label.trim().length < 1 || label.length > 60) {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  return Response.json(await provisionStandaloneOrg(ref, label));
}
