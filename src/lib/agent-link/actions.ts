"use server";

import { getSession } from "@/lib/auth/session";
import { createAgentLinkToken } from "./service";

/** Génère un code de liaison pour l'agent, valable 2h, lié à l'organisation courante. */
export async function generateAgentLinkCode(): Promise<
  { ok: true; code: string; expiresAt: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Non authentifié." };
  const { code, expiresAt } = await createAgentLinkToken(session.orgId, session.userId, session.email);
  return { ok: true, code, expiresAt: expiresAt.toISOString() };
}
