// Provisioning agent — ÉTAPE FINALE côté SaaS : enregistrer le routeur dans la
// BD et renvoyer le PLAN que l'agent appliquera LOCALEMENT sur le routeur.
//
// L'agent exécute l'auto-setup localement (robuste), mais en communication avec
// la BD du SaaS : ici on vérifie le paiement, on verrouille la série à l'org, on
// crée la ligne routeur, on consomme l'autorisation, et on renvoie le plan
// (forfaits → profils voucher, hotspot, MikHmon, type de routeur). L'application
// device se fait dans l'agent (provisionDockerStack & co, réutilisés).
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { autoSetupAuthorizations, routers, routerSerialLocks, users } from "@/lib/db/schema";
import { resolveAgentLinkFromRequest } from "@/lib/agent-link/service";
import { isSuperAdmin } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/mikrotik/crypto";
import { API_USERNAME } from "@/lib/mikrotik/install-token";

type Forfait = { label?: string; priceFcfa?: number; durationCode?: string; packageId?: string };

export async function POST(request: Request) {
  const link = await resolveAgentLinkFromRequest(request);
  if (!link.ok) return Response.json({ error: "Code invalide." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    serial?: string;
    model?: string;
    supportsContainers?: boolean;
    wifiName?: string;
    hotspotAddress?: string;
    portalId?: string | null;
    forfaits?: Forfait[];
  };
  const serial = String(body.serial ?? "").trim();
  if (!serial) return Response.json({ error: "Numéro de série requis." }, { status: 400 });

  const db = getDb();
  const role = link.userId
    ? (await db.select({ role: users.role }).from(users).where(eq(users.id, link.userId)).limit(1))[0]?.role
    : undefined;
  const superadmin = isSuperAdmin(role);

  // 1) Paiement : superadmin gratuit, sinon une autorisation approuvée non consommée.
  const [auth] = superadmin
    ? [undefined]
    : await db
        .select({ id: autoSetupAuthorizations.id })
        .from(autoSetupAuthorizations)
        .where(and(
          eq(autoSetupAuthorizations.orgId, link.orgId),
          eq(autoSetupAuthorizations.serialNumber, serial),
          eq(autoSetupAuthorizations.status, "approved"),
          isNull(autoSetupAuthorizations.consumedAt),
        ))
        .limit(1);
  if (!superadmin && !auth) {
    return Response.json({ error: "Paiement non confirmé pour cette série." }, { status: 402 });
  }

  // 2) Verrou de série : jamais rattacher un routeur déjà détenu par une AUTRE org.
  const [lock] = await db.select().from(routerSerialLocks).where(eq(routerSerialLocks.serialNumber, serial)).limit(1);
  if (lock && !lock.releasedAt && lock.orgId && lock.orgId !== link.orgId) {
    return Response.json({ error: "Ce routeur (numéro de série) est déjà rattaché à une autre organisation." }, { status: 409 });
  }

  // 3) Routeur réutilisé pour cette org+série, sinon créé.
  const existing = lock?.routerId
    ? (await db.select({ id: routers.id }).from(routers).where(and(eq(routers.id, lock.routerId), eq(routers.orgId, link.orgId))).limit(1))[0]
    : undefined;
  const apiPassword = randomBytes(18).toString("base64url");
  let routerId = existing?.id;
  if (!routerId) {
    const [row] = await db
      .insert(routers)
      .values({
        orgId: link.orgId,
        name: body.wifiName?.trim() || `Routeur ${serial}`,
        model: body.model ?? null,
        username: API_USERNAME,
        passwordEncrypted: encryptSecret(apiPassword),
        status: "configuring",
        supportsContainers: !!body.supportsContainers,
      })
      .returning({ id: routers.id });
    routerId = row.id;
  }

  // Verrou de série posé/mis à jour.
  if (lock) {
    await db.update(routerSerialLocks).set({ orgId: link.orgId, routerId, releasedAt: null }).where(eq(routerSerialLocks.id, lock.id));
  } else {
    await db.insert(routerSerialLocks).values({ serialNumber: serial, orgId: link.orgId, routerId });
  }

  // 4) Autorisation consommée (rattachée au routeur).
  if (auth) {
    await db.update(autoSetupAuthorizations).set({ consumedAt: new Date(), routerId }).where(eq(autoSetupAuthorizations.id, auth.id));
  }

  // 5) Plan à appliquer localement par l'agent.
  const forfaits = (body.forfaits ?? []).map((f) => ({
    name: f.label ?? "Forfait",
    priceFcfa: Number(f.priceFcfa ?? 0),
    durationCode: f.durationCode ?? "1d",
  }));
  return Response.json({
    routerId,
    plan: {
      supportsContainers: !!body.supportsContainers,
      hotspotName: body.wifiName?.trim() || "SafeLinkHub WIFI",
      hotspotAddress: body.hotspotAddress?.trim() || "10.0.0.1/8",
      portalId: body.portalId ?? null,
      forfaits,
      // L'agent crée son propre compte API MikHmon localement ; ce mot de passe
      // sert d'amorce si besoin. Jamais journalisé côté agent.
      apiUser: API_USERNAME,
      apiPassword,
    },
  });
}
