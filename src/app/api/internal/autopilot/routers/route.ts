import { routersForToken } from "@/lib/autopilot/link";
import { autopilotCallAllowed, notFound } from "../guard";

export const dynamic = "force-dynamic";

/** GET (en-tête x-slh-link: <jeton>) → routeurs WireGuard de l'organisation liée. */
export async function GET(request: Request) {
  if (!autopilotCallAllowed(request)) return notFound();
  const token = request.headers.get("x-slh-link") ?? "";
  const res = token ? await routersForToken(token) : null;
  if (!res) return Response.json({ error: "Liaison inconnue ou révoquée." }, { status: 401 });
  return Response.json(res);
}
