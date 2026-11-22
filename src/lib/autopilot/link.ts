import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { autopilotLinks, organizations, routerMikhmonCloudInstances, routerPortForwards, routers } from "@/lib/db/schema";

/**
 * Liaison SafeLink Auto-Pilot ↔ SafeLinkHub. SafeLinkHub reste le SEUL
 * gestionnaire WireGuard (wg0) : Auto-Pilot ne fait que lire la liste des
 * routeurs déjà connectés et les joint par leur IP de tunnel depuis le VPS.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function newLinkCode(): string {
  let c = "";
  for (let i = 0; i < 8; i++) c += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  return c;
}

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type AutopilotRouter = {
  id: string;
  name: string;
  online: boolean;
  tunnelIp: string;
  model: string | null;
  /** Variante MikHmon au sens d'Auto-Pilot : v3 | sf-v1. null = pas de MikHmon. */
  mikhmonVariant: "v3" | "sf-v1" | null;
  /** API REST RouterOS (service www) par le tunnel. */
  routerosUrl: string;
  mikhmonUrl: string | null;
};

type Forward = { service: string; targetPort: number };

/** Ligne routeur + redirections actives + instance cloud → vue Auto-Pilot. */
export function toAutopilotRouter(
  r: { id: string; name: string; host: string; status: string; model: string | null; mikhmonImage: string | null },
  forwards: Forward[],
  cloud: { domain: string; edition: string } | null,
): AutopilotRouter {
  const cloudDomain = cloud?.domain ?? null;
  const webfig = forwards.find((f) => f.service === "webfig");
  const mk = forwards.find((f) => f.service === "mikhmon");
  const variant = cloud
    ? cloud.edition === "v6" ? "v3" : "sf-v1"
    : r.mikhmonImage ? (/mikhmonv3/i.test(r.mikhmonImage) ? "v3" : "sf-v1") : null;
  const mikhmonUrl = cloudDomain
    ? `https://${cloudDomain}/admin.php?id=login`
    : mk || r.mikhmonImage
      ? `http://${r.host}:${mk?.targetPort ?? 8089}/admin.php?id=login`
      : null;
  return {
    id: r.id,
    name: r.name,
    online: r.status === "online",
    tunnelIp: r.host,
    model: r.model,
    mikhmonVariant: variant,
    routerosUrl: `http://${r.host}:${webfig?.targetPort ?? 80}`,
    mikhmonUrl,
  };
}

/** Nouveau code (remplace le précédent ; le jeton existant reste valide). */
export async function createLinkCode(orgId: string): Promise<string> {
  const code = newLinkCode();
  const values = { codeHash: sha256(code), codeExpiresAt: new Date(Date.now() + CODE_TTL_MS) };
  await getDb().insert(autopilotLinks).values({ orgId, ...values }).onConflictDoUpdate({ target: autopilotLinks.orgId, set: values });
  return code;
}

/** Code valide → nouveau jeton (le code est consommé). null sinon. */
export async function exchangeLinkCode(code: string): Promise<{ token: string; orgName: string } | null> {
  const db = getDb();
  const [row] = await db
    .select({ orgId: autopilotLinks.orgId, orgName: organizations.name })
    .from(autopilotLinks)
    .innerJoin(organizations, eq(organizations.id, autopilotLinks.orgId))
    .where(and(eq(autopilotLinks.codeHash, sha256(normalizeCode(code))), gt(autopilotLinks.codeExpiresAt, new Date())));
  if (!row) return null;
  const token = randomBytes(32).toString("base64url");
  await db
    .update(autopilotLinks)
    .set({ tokenHash: sha256(token), codeHash: null, codeExpiresAt: null, linkedAt: new Date() })
    .where(eq(autopilotLinks.orgId, row.orgId));
  return { token, orgName: row.orgName };
}

/** Routeurs WireGuard de l'organisation liée au jeton. null = jeton inconnu. */
export async function routersForToken(token: string): Promise<{ orgName: string; routers: AutopilotRouter[] } | null> {
  const db = getDb();
  const [link] = await db
    .select({ orgId: autopilotLinks.orgId, orgName: organizations.name })
    .from(autopilotLinks)
    .innerJoin(organizations, eq(organizations.id, autopilotLinks.orgId))
    .where(eq(autopilotLinks.tokenHash, sha256(token)));
  if (!link) return null;
  await db.update(autopilotLinks).set({ lastUsedAt: new Date() }).where(eq(autopilotLinks.orgId, link.orgId));
  const rows = (
    await db
      .select({ id: routers.id, name: routers.name, tunnelIp: routers.tunnelIp, wgHost: routers.host, status: routers.status, model: routers.model, mikhmonImage: routers.mikhmonImage })
      .from(routers)
      .where(eq(routers.orgId, link.orgId))
  )
    .map(({ tunnelIp, wgHost, ...r }) => ({ ...r, host: tunnelIp || wgHost || "" }))
    .filter((r) => r.host.startsWith("10.66."));
  const ids = rows.map((r) => r.id);
  const [fwd, cloud] = ids.length
    ? await Promise.all([
        db
          .select({ routerId: routerPortForwards.routerId, service: routerPortForwards.service, targetPort: routerPortForwards.targetPort })
          .from(routerPortForwards)
          .where(and(inArray(routerPortForwards.routerId, ids), eq(routerPortForwards.status, "active"))),
        db
          .select({ routerId: routerMikhmonCloudInstances.routerId, domain: routerMikhmonCloudInstances.domain, edition: routerMikhmonCloudInstances.edition })
          .from(routerMikhmonCloudInstances)
          .where(and(inArray(routerMikhmonCloudInstances.routerId, ids), eq(routerMikhmonCloudInstances.status, "active"))),
      ])
    : [[], []];
  return {
    orgName: link.orgName,
    routers: rows
      .map((r) => toAutopilotRouter(r, fwd.filter((f) => f.routerId === r.id), cloud.find((c) => c.routerId === r.id) ?? null))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function linkStatus(orgId: string) {
  const [row] = await getDb()
    .select({ linkedAt: autopilotLinks.linkedAt, lastUsedAt: autopilotLinks.lastUsedAt, tokenHash: autopilotLinks.tokenHash })
    .from(autopilotLinks)
    .where(eq(autopilotLinks.orgId, orgId));
  return row?.tokenHash ? { linkedAt: row.linkedAt, lastUsedAt: row.lastUsedAt } : null;
}

export async function revokeLink(orgId: string) {
  await getDb().delete(autopilotLinks).where(eq(autopilotLinks.orgId, orgId));
}

/** Organisation liée au jeton (null = jeton inconnu). */
export async function orgForToken(token: string): Promise<{ orgId: string; orgName: string; orgSlug: string } | null> {
  const [row] = await getDb()
    .select({ orgId: autopilotLinks.orgId, orgName: organizations.name, orgSlug: organizations.slug })
    .from(autopilotLinks)
    .innerJoin(organizations, eq(organizations.id, autopilotLinks.orgId))
    .where(eq(autopilotLinks.tokenHash, sha256(token)));
  return row ?? null;
}

export type AutopilotAccount = { name: string; password: string; access: "read" | "write" };

/** Groupe RouterOS dédié par niveau d'accès (REST compris). */
export const AUTOPILOT_GROUPS = {
  read: { name: "autopilot-read", policy: "read,test,web,api,rest-api" },
  write: { name: "autopilot-write", policy: "read,write,test,web,api,rest-api,reboot" },
} as const;

export function validAccounts(input: unknown): AutopilotAccount[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 2) return null;
  const out: AutopilotAccount[] = [];
  for (const a of input) {
    const v = a as Record<string, unknown>;
    if (typeof v.name !== "string" || !/^[A-Za-z0-9._-]{2,32}$/.test(v.name)) return null;
    if (typeof v.password !== "string" || v.password.length < 8 || v.password.length > 128 || /["\\\r\n]/.test(v.password)) return null;
    if (v.access !== "read" && v.access !== "write") return null;
    if (v.name === "admin" || v.name.startsWith("safelinkhub")) return null;
    out.push({ name: v.name, password: v.password, access: v.access });
  }
  return out;
}

/**
 * Espace Auto-Pilot SANS compte SafeLinkHub : une organisation technique lui
 * est créée (aucun utilisateur, slug « autopilot-<ref> »), liée d'emblée.
 * SafeLinkHub reste le seul gestionnaire WireGuard : les routeurs ajoutés par
 * la ligne collée y vivent comme les autres. Idempotent sur la référence.
 */
export function standaloneSlug(ref: string): string {
  return "autopilot-" + sha256("autopilot-space:" + ref).slice(0, 16);
}

export async function provisionStandaloneOrg(ref: string, label: string): Promise<{ token: string; orgName: string }> {
  const db = getDb();
  const slug = standaloneSlug(ref);
  const name = ("Auto-Pilot — " + label.replace(/[\r\n\t]+/g, " ").trim()).slice(0, 80);
  const [existing] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.slug, slug));
  const org = existing ?? (await db.insert(organizations).values({ name, slug }).returning({ id: organizations.id, name: organizations.name }))[0];
  const token = randomBytes(32).toString("base64url");
  const values = { tokenHash: sha256(token), codeHash: null, codeExpiresAt: null, linkedAt: new Date() };
  await db.insert(autopilotLinks).values({ orgId: org.id, ...values }).onConflictDoUpdate({ target: autopilotLinks.orgId, set: values });
  return { token, orgName: org.name };
}
