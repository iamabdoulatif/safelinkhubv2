import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, safecoinFeeRules, safecoinSettings } from "@/lib/db/schema";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";
import { resellerState, setupFeeCentsFor, RESELLER_SETUP_FEE_CENTS } from "@/lib/billing/reseller";
import { PERIOD_PRICE_CENTS, type BillingPeriod } from "@/lib/mikrotik/billing-plans";
import { DEFAULT_SC_RATE_FCFA } from "./constants";
import { fcfaToScCents } from "./pricing";
import { appendSafecoinDebit } from "./ledger";

export function vpnPriceScCents(rate = DEFAULT_SC_RATE_FCFA) {
  return Object.fromEntries(
    Object.entries(PERIOD_PRICE_CENTS).map(([period, price]) => [
      period,
      fcfaToScCents(price, rate),
    ]),
  ) as Record<BillingPeriod, number>;
}

export function autoSetupPriceScCents(supportsContainers: boolean, rate = DEFAULT_SC_RATE_FCFA) {
  return fcfaToScCents(autoSetupFeeCentsFor(supportsContainers), rate);
}

async function currentSettings() {
  const [settings] = await getDb()
    .select({
      rateFcfaPerSc: safecoinSettings.rateFcfaPerSc,
      vpnFeeScCents: safecoinSettings.vpnFeeScCents,
      autoSetupFeeScCents: safecoinSettings.autoSetupFeeScCents,
    })
    .from(safecoinSettings)
    .limit(1);
  return settings ?? {
    rateFcfaPerSc: DEFAULT_SC_RATE_FCFA,
    vpnFeeScCents: 0,
    autoSetupFeeScCents: 0,
  };
}

async function feeFor(service: string) {
  const [fee] = await getDb()
    .select({ amountScCents: safecoinFeeRules.amountScCents })
    .from(safecoinFeeRules)
    .where(and(eq(safecoinFeeRules.service, service), eq(safecoinFeeRules.active, true)))
    .orderBy(desc(safecoinFeeRules.version))
    .limit(1);
  return fee?.amountScCents ?? 0;
}

export async function vpnActivationChargeScCents(opts: {
  billingPeriod: BillingPeriod;
}) {
  const settings = await currentSettings();
  const baseFcfa = PERIOD_PRICE_CENTS[opts.billingPeriod];
  return (
    fcfaToScCents(baseFcfa, settings.rateFcfaPerSc) +
    settings.vpnFeeScCents +
    (await feeFor("vpn"))
  );
}

/**
 * Tarif d'installation applicable à une organisation.
 *
 * Sans orgId on renvoie le tarif public : c'est le cas des affichages
 * génériques (landing, grille tarifaire), qui ne parlent d'aucun compte.
 *
 * La lecture tolère l'absence des colonnes revendeur — l'image peut être
 * déployée avant que scripts/add-reseller-accounts.sql soit passé. Dans ce cas
 * personne n'est revendeur, donc tout le monde paie le tarif public : se
 * tromper dans ce sens ne coûte rien à personne, l'inverse offrirait la remise
 * à tout le monde.
 */
export async function setupFeeFcfaFor(opts: {
  supportsContainers: boolean;
  orgId?: string;
}): Promise<number> {
  if (!opts.orgId) return autoSetupFeeCentsFor(opts.supportsContainers);
  const [row] = await getDb()
    .select({
      accountType: organizations.accountType,
      resellerActivatedAt: organizations.resellerActivatedAt,
      resellerExpiresAt: organizations.resellerExpiresAt,
      resellerQuotaUsed: organizations.resellerQuotaUsed,
    })
    .from(organizations)
    .where(eq(organizations.id, opts.orgId))
    .limit(1)
    .catch(() => []);
  return setupFeeCentsFor(resellerState(row ?? null), opts.supportsContainers, autoSetupFeeCentsFor);
}

export async function autoSetupChargeScCents(opts: {
  supportsContainers: boolean;
  orgId?: string;
}) {
  const settings = await currentSettings();
  const baseFcfa = await setupFeeFcfaFor(opts);
  return (
    fcfaToScCents(baseFcfa, settings.rateFcfaPerSc) +
    settings.autoSetupFeeScCents +
    (await feeFor("auto_setup"))
  );
}

export async function chargeVpnActivation(opts: {
  orgId: string;
  userId: string;
  forwardId: string;
  service: string;
  billingPeriod: BillingPeriod;
  routerName: string;
}) {
  const baseFcfa = PERIOD_PRICE_CENTS[opts.billingPeriod];
  const amountScCents = await vpnActivationChargeScCents({ billingPeriod: opts.billingPeriod });
  return appendSafecoinDebit({
    orgId: opts.orgId,
    userId: opts.userId,
    entryType: "vpn_charge",
    amountScCents,
    referenceFcfaCents: baseFcfa,
    idempotencyKey: `vpn:${opts.forwardId}:period:${opts.billingPeriod}`,
    referenceType: "router_port_forward",
    referenceId: opts.forwardId,
    note: `${opts.service} — ${opts.routerName}`,
  });
}

export async function chargeAutoSetup(opts: {
  orgId: string;
  userId: string;
  routerId: string;
  supportsContainers: boolean;
}) {
  const baseFcfa = await setupFeeFcfaFor({
    supportsContainers: opts.supportsContainers,
    orgId: opts.orgId,
  });
  const usedResellerRate = baseFcfa === RESELLER_SETUP_FEE_CENTS;
  const amountScCents = await autoSetupChargeScCents({
    supportsContainers: opts.supportsContainers,
    orgId: opts.orgId,
  });
  const result = await appendSafecoinDebit({
    orgId: opts.orgId,
    userId: opts.userId,
    entryType: "auto_setup_charge",
    amountScCents,
    referenceFcfaCents: baseFcfa,
    idempotencyKey: `auto-setup:${opts.routerId}`,
    referenceType: "router",
    referenceId: opts.routerId,
    note: supportsContainerLabel(opts.supportsContainers),
  });

  // Le quota ne se décompte QUE si l'écriture a réellement été créée.
  // appendSafecoinDebit est idempotent sur `auto-setup:<routerId>` : rejouer
  // la même installation renvoie `created: false` sans débiter. Incrémenter
  // sans cette garde brûlerait une pose du quota à chaque nouvel essai, et le
  // revendeur perdrait des installations qu'il n'a jamais faites.
  if (usedResellerRate && result.created) {
    await getDb()
      .update(organizations)
      .set({ resellerQuotaUsed: sql`${organizations.resellerQuotaUsed} + 1` })
      .where(eq(organizations.id, opts.orgId));
  }

  return result;
}

function supportsContainerLabel(supportsContainers: boolean) {
  return supportsContainers ? "Auto-Setup avec conteneur" : "Auto-Setup hotspot";
}
