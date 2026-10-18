"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  routers,
  bridges,
  routerMultiwanLicenses,
  safecoinAccounts,
  safecoinSettings,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { getWalletBalanceCents } from "@/lib/wallet/balance";
import { fcfaToScCents } from "@/lib/safecoin/pricing";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";
import {
  defaultMultiwanConfig,
  MULTIWAN_PRICE_FCFA,
  UUID,
  validateMultiwan,
  type MultiwanConfig,
} from "./config";
import { generateMultiwanScript } from "./generator";
import { purchaseMultiwan } from "./payment";

async function access(routerId: string) {
  const session = await getSession();
  if (!session || typeof routerId !== "string" || !UUID.test(routerId))
    return null;
  // Licences are purchased by this organization, even for platform operators.
  const [router] = await getDb()
    .select({ id: routers.id, name: routers.name })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  return router ? { session, router } : null;
}
export async function readMultiwanPremium(routerId: string) {
  const auth = await access(routerId);
  if (!auth) return { error: "Routeur introuvable dans votre organisation." };
  const db = getDb();
  const [license, settings, account, wanWallet, hotspotBridges] =
    await Promise.all([
      db
        .select()
        .from(routerMultiwanLicenses)
        .where(
          and(
            eq(routerMultiwanLicenses.orgId, auth.session.orgId),
            eq(routerMultiwanLicenses.routerId, routerId),
          ),
        )
        .limit(1),
      db
        .select({ rate: safecoinSettings.rateFcfaPerSc })
        .from(safecoinSettings)
        .limit(1),
      db
        .select({
          balance: safecoinAccounts.balanceScCents,
          status: safecoinAccounts.status,
        })
        .from(safecoinAccounts)
        .where(eq(safecoinAccounts.orgId, auth.session.orgId))
        .limit(1),
      getWalletBalanceCents(auth.session.orgId),
      db
        .select({
          name: bridges.name,
          gateway: bridges.gatewayIp,
          bits: bridges.subnetBits,
        })
        .from(bridges)
        .where(
          and(eq(bridges.routerId, routerId), eq(bridges.hotspotEnabled, true)),
        ),
    ]);
  const rate = settings[0]?.rate ?? DEFAULT_SC_RATE_FCFA;
  const defaults = defaultMultiwanConfig();
  if (hotspotBridges.length) {
    defaults.network = "hotspot";
    defaults.lanInterface = hotspotBridges[0].name;
    const { gateway, bits } = hotspotBridges[0];
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(gateway) && bits >= 8 && bits <= 30) {
      const numeric = gateway
        .split(".")
        .reduce((n, b) => n * 256 + Number(b), 0);
      const base = Math.floor(numeric / 2 ** (32 - bits)) * 2 ** (32 - bits);
      defaults.lanCidr =
        [24, 16, 8, 0].map((shift) => (base >>> shift) & 255).join(".") +
        "/" +
        bits;
    }
  }
  return {
    priceFcfa: MULTIWAN_PRICE_FCFA,
    scCost: fcfaToScCents(MULTIWAN_PRICE_FCFA, rate),
    rate,
    walletBalance: wanWallet,
    scBalance: account[0]?.status === "active" ? account[0].balance : 0,
    paid: Boolean(license[0]),
    purchasedAt: license[0]?.purchasedAt.toISOString() ?? null,
    config: license[0]?.config ?? defaults,
    canManage: can(auth.session.role, "routers"),
    routerName: auth.router.name,
    hotspot: hotspotBridges.map((b) => b.name),
  };
}
export async function payMultiwanPremium(
  routerId: string,
  source: "wallet" | "safecoin",
  quotedRate: number,
) {
  const auth = await access(routerId);
  if (!auth || !can(auth.session.role, "routers"))
    return { error: "Action non autorisée." };
  if (!["wallet", "safecoin"].includes(source))
    return { error: "Moyen de paiement invalide." };
  try {
    return {
      ok: true,
      ...(await purchaseMultiwan({
        routerId,
        orgId: auth.session.orgId,
        userId: auth.session.userId,
        source,
        quotedRate,
      })),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Paiement indisponible.",
    };
  }
}
export async function generatePaidMultiwan(
  routerId: string,
  config: MultiwanConfig,
) {
  const auth = await access(routerId);
  if (!auth || !can(auth.session.role, "routers"))
    return { error: "Action non autorisée." };
  const invalid = validateMultiwan(config);
  if (invalid) return { error: invalid };
  const db = getDb();
  // Hold the router ownership row while checking licence, recording settings
  // and releasing the script; a concurrent transfer cannot unlock another org.
  return db.transaction(async (tx) => {
    const [router] = await tx
      .select({ id: routers.id })
      .from(routers)
      .where(
        and(eq(routers.id, routerId), eq(routers.orgId, auth.session.orgId)),
      )
      .for("update");
    if (!router) return { error: "Ce routeur a changé d’organisation." };
    const [license] = await tx
      .select({ id: routerMultiwanLicenses.id })
      .from(routerMultiwanLicenses)
      .where(
        and(
          eq(routerMultiwanLicenses.orgId, auth.session.orgId),
          eq(routerMultiwanLicenses.routerId, routerId),
        ),
      )
      .limit(1);
    if (!license)
      return {
        error:
          "Activez Multi-WAN Premium pour ce routeur avant de générer un script.",
      };
    const script = generateMultiwanScript(routerId, config);
    await tx
      .update(routerMultiwanLicenses)
      .set({ config, generatedAt: new Date() })
      .where(eq(routerMultiwanLicenses.id, license.id));
    return { script };
  });
}
