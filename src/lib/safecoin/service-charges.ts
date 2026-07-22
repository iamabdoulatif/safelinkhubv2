import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { safecoinFeeRules, safecoinSettings } from "@/lib/db/schema";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";
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

export async function autoSetupChargeScCents(opts: { supportsContainers: boolean }) {
  const settings = await currentSettings();
  const baseFcfa = autoSetupFeeCentsFor(opts.supportsContainers);
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
  const baseFcfa = autoSetupFeeCentsFor(opts.supportsContainers);
  const amountScCents = await autoSetupChargeScCents({ supportsContainers: opts.supportsContainers });
  return appendSafecoinDebit({
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
}

function supportsContainerLabel(supportsContainers: boolean) {
  return supportsContainers ? "Auto-Setup avec conteneur" : "Auto-Setup hotspot";
}
