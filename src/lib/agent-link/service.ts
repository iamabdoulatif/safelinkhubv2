// Liaison de l'agent local à une organisation (architecture A).
//
// Module "plain" (pas de "use server") : importable par les server actions, les
// server components ET les route handlers d'API de l'agent. La génération exige
// une session (opérateur connecté) ; la résolution se fait par le Bearer que
// l'agent présente, et ne révèle jamais le code en clair.
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { agentLinkTokens, organizations } from "@/lib/db/schema";

// 2h, comme install-token : le temps de coller le code et de lancer une config.
export const AGENT_LINK_TTL_MS = 2 * 60 * 60 * 1000;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Code lisible : 4 groupes de 4, base32 sans ambiguïté (ex. K7P2-9FRX-...). */
function friendlyCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans I,O,0,1
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

/** Normalise une saisie (espaces, casse, tirets) vers la forme canonique. */
export function normalizeCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.replace(/(.{4})(?=.)/g, "$1-");
}

export type LinkResolution =
  | { ok: true; orgId: string; orgName: string; tokenId: string }
  | { ok: false; reason: "invalid" | "expired" };

/** Crée un code de liaison pour l'organisation de la session. Renvoie le code EN CLAIR une seule fois. */
export async function createAgentLinkToken(
  orgId: string,
  userId: string | null,
  label?: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = friendlyCode();
  const expiresAt = new Date(Date.now() + AGENT_LINK_TTL_MS);
  await getDb()
    .insert(agentLinkTokens)
    .values({ orgId, userId, tokenHash: hash(normalizeCode(code)), label: label ?? null, expiresAt });
  return { code, expiresAt };
}

/** Résout le code présenté par l'agent (Bearer) vers une organisation. Met à jour lastUsedAt. */
export async function resolveAgentLink(rawCode: string): Promise<LinkResolution> {
  const code = normalizeCode(rawCode);
  if (code.replace(/-/g, "").length < 16) return { ok: false, reason: "invalid" };
  const db = getDb();
  const [row] = await db
    .select({ id: agentLinkTokens.id, orgId: agentLinkTokens.orgId, expiresAt: agentLinkTokens.expiresAt, orgName: organizations.name })
    .from(agentLinkTokens)
    .innerJoin(organizations, eq(organizations.id, agentLinkTokens.orgId))
    .where(and(eq(agentLinkTokens.tokenHash, hash(code)), isNull(agentLinkTokens.revokedAt)))
    .limit(1);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  await db.update(agentLinkTokens).set({ lastUsedAt: new Date() }).where(eq(agentLinkTokens.id, row.id));
  return { ok: true, orgId: row.orgId, orgName: row.orgName, tokenId: row.id };
}

/** Variante stricte pour les handlers d'API : lit le header Authorization. */
export async function resolveAgentLinkFromRequest(req: Request): Promise<LinkResolution> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m) return { ok: false, reason: "invalid" };
  return resolveAgentLink(m[1]);
}
