import { exchangeLinkCode } from "@/lib/autopilot/link";
import { autopilotCallAllowed, notFound } from "../guard";

export const dynamic = "force-dynamic";

/** POST { code } → { token, orgName } : échange du code de liaison (usage unique). */
export async function POST(request: Request) {
  if (!autopilotCallAllowed(request)) return notFound();
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code) return Response.json({ error: "Code manquant." }, { status: 400 });
  const res = await exchangeLinkCode(code);
  if (!res) return Response.json({ error: "Code invalide ou expiré." }, { status: 400 });
  return Response.json(res);
}
