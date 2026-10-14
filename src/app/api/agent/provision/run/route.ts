// Provisioning agent — côté SaaS : enregistrer le routeur dans la BD, poser un
// jeton d'installation (l'agent met le routeur en ligne), STOCKER le plan
// d'auto-setup, puis renvoyer la commande d'installation.
//
// Le routeur reçoit Internet par le WAN ; l'agent exécute LOCALEMENT la commande
// de mise en ligne (il n'attend pas que le SaaS atteigne le routeur), puis le
// SaaS exécute l'auto-setup ÉPROUVÉ via le tunnel (endpoint execute). Zéro code
// device dupliqué.
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { autoSetupAuthorizations, organizations, routers, routerSerialLocks, users } from "@/lib/db/schema";
import { resolveAgentLinkFromRequest } from "@/lib/agent-link/service";
import { isSuperAdmin } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/mikrotik/crypto";
import { API_USERNAME, INSTALL_TOKEN_TTL_MS, hashToken } from "@/lib/mikrotik/install-token";
import { WIFI_ENABLE_ANY_VERSION } from "@/lib/mikrotik/provisioning-commands";
import { getAppUrl } from "@/lib/net/app-url";
import { buildVoucherProfile, buildCustomProfileName, type DurationUnit, type VoucherProfile } from "@/lib/mikrotik/voucher-profiles";
import type { HotspotStackOptions } from "@/lib/mikrotik/container-setup";

type Forfait = { label?: string; priceFcfa?: number; durationCode?: string };

/** « 10.0.0.1/8 » → { address: "10.0.0.1", bits: 8 }. */
function splitHotspot(input: string): { address: string; bits: number } {
  const [address, bits] = input.split("/");
  return { address: address.trim(), bits: Number(bits) || 8 };
}

/** Forfait choisi → profil voucher RouterOS (réutilise buildVoucherProfile). */
function toVoucherProfile(f: Forfait): VoucherProfile | null {
  const code = (f.durationCode ?? "").trim();
  const m = /^(\d+)(m|h|d|w|mo)$/.exec(code);
  if (!m) return null;
  const amount = Number(m[1]);
  const unit = m[2] as DurationUnit;
  return buildVoucherProfile({
    name: buildCustomProfileName(amount, unit),
    label: f.label ?? "Forfait",
    durationCode: code,
    price: Number(f.priceFcfa ?? 0),
  });
}

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
  const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, link.orgId)).limit(1);
  const role = link.userId
    ? (await db.select({ role: users.role }).from(users).where(eq(users.id, link.userId)).limit(1))[0]?.role
    : undefined;
  const superadmin = isSuperAdmin(role);

  // 1) Paiement : superadmin gratuit, sinon autorisation approuvée non consommée.
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
  if (!superadmin && !auth) return Response.json({ error: "Paiement non confirmé pour cette série." }, { status: 402 });

  // 2) Verrou de série : jamais une autre org.
  const [lock] = await db.select().from(routerSerialLocks).where(eq(routerSerialLocks.serialNumber, serial)).limit(1);
  if (lock && !lock.releasedAt && lock.orgId && lock.orgId !== link.orgId) {
    return Response.json({ error: "Ce routeur (numéro de série) est déjà rattaché à une autre organisation." }, { status: 409 });
  }

  // 3) Plan d'auto-setup (HotspotStackOptions) à exécuter ensuite par le SaaS.
  const hotspot = splitHotspot(body.hotspotAddress?.trim() || "10.0.0.1/8");
  const hotspotName = body.wifiName?.trim() || "SafeLinkHub WIFI";
  const voucherProfiles = (body.forfaits ?? []).map(toVoucherProfile).filter((p): p is VoucherProfile => !!p);
  const opts: HotspotStackOptions = {
    hotspotAddress: hotspot.address,
    hotspotPrefixBits: hotspot.bits,
    hotspotName,
    dnsName: hotspotName.toLowerCase().replace(/\s+/g, "") + ".ci",
    supportsContainers: !!body.supportsContainers,
    hasUsbStorage: false,
    reboot: true,
    ssid: hotspotName,
    ...(voucherProfiles.length ? { voucherProfiles } : {}),
  };

  // 4) Routeur créé (ou réutilisé) + jeton d'installation + plan stocké.
  const apiPassword = randomBytes(18).toString("base64url");
  const installToken = randomUUID();
  // status "pending" OBLIGATOIRE : le script /scripts/install-vpn n'émet le
  // tunnel QUE pour un routeur en "pending" (sinon 403). Sans ça, le /tool
  // fetch du routeur récupérait un corps d'erreur, /import échouait, le routeur
  // ne rejoignait jamais le tunnel, son statut ne passait jamais "online" et
  // l'auto-setup (execute) bouclait en 425 jusqu'au timeout. Même convention que
  // le flux manuel (actions.ts) et la récupération (router-recovery-actions.ts).
  const installFields = {
    status: "pending" as const,
    installTokenHash: hashToken(installToken),
    installTokenExpiresAt: new Date(Date.now() + INSTALL_TOKEN_TTL_MS),
    lastAutoSetupConfig: opts,
  };
  let routerId = lock?.routerId ?? undefined;
  if (routerId) {
    await db.update(routers).set({ name: hotspotName, model: body.model ?? null, ...installFields }).where(eq(routers.id, routerId));
  } else {
    const [row] = await db
      .insert(routers)
      .values({
        orgId: link.orgId,
        name: hotspotName,
        model: body.model ?? null,
        username: API_USERNAME,
        passwordEncrypted: encryptSecret(apiPassword),
        supportsContainers: !!body.supportsContainers,
        ...installFields,
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

  // 5) Autorisation consommée.
  if (auth) await db.update(autoSetupAuthorizations).set({ consumedAt: new Date(), routerId }).where(eq(autoSetupAuthorizations.id, auth.id));

  // 6) Commande d'installation (même forme que le flux manuel éprouvé) :
  //    l'agent la lance sur le routeur pour le mettre en ligne (tunnel WireGuard).
  const scriptUrl = `${getAppUrl()}/api/router/v1/${org?.slug}/scripts/install-vpn`;
  const fetchMode = scriptUrl.startsWith("https://") ? "https" : "http";
  const installCommand = `/interface/ethernet/set [find name=ether1] name=E1-WAN-FAI; ${WIFI_ENABLE_ANY_VERSION}; /tool fetch url="${scriptUrl}" http-header-field="Authorization: Bearer ${installToken}" dst-path="vpn.rsc" mode=${fetchMode}; :delay 2s; /import file-name="vpn.rsc"; :delay 1s; /ip route remove [find dst-address=10.66.0.0/24 gateway=safelinkhub-wg0]; /ip route add dst-address=10.66.0.0/24 gateway=safelinkhub-wg0; :delay 1s; /file remove "vpn.rsc"`;

  return Response.json({
    routerId,
    installCommand,
    plan: { supportsContainers: opts.supportsContainers, hotspotName, hotspotAddress: body.hotspotAddress ?? "10.0.0.1/8", forfaits: voucherProfiles.map((p) => p.name) },
  });
}
