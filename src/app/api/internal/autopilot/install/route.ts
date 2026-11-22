import { orgForToken } from "@/lib/autopilot/link";
import { createVpnInstall } from "@/lib/mikrotik/vpn-install";
import { autopilotCallAllowed, notFound } from "../guard";

export const dynamic = "force-dynamic";

/**
 * POST { name } (en-tête x-slh-link) → { routerId, command } : ligne à coller
 * dans le terminal MikroTik, créée dans l'organisation liée. Version « sans
 * conflit » : un routeur portant déjà safelinkhub-wg0 n'est pas réinstallé.
 */
export async function POST(request: Request) {
  if (!autopilotCallAllowed(request)) return notFound();
  const org = await orgForToken(request.headers.get("x-slh-link") ?? "");
  if (!org) return Response.json({ error: "Liaison inconnue ou révoquée." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.replace(/[\r\n\t]+/g, " ").trim() : "";
  if (name.length < 2 || name.length > 64) return Response.json({ error: "Nom du routeur : 2 à 64 caractères." }, { status: 400 });
  const res = await createVpnInstall({ orgId: org.orgId, orgSlug: org.orgSlug, name, guarded: true });
  return Response.json(res);
}
