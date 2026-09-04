"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  routerMikhmonCloudInstances,
  routerPortForwards,
  routers,
  organizations,
  walletTransactions,
} from "@/lib/db/schema";
import { capVpnAccessExpiry, getVpnQuotaStatus, shouldChargeVpnActivation } from "@/lib/billing/vpn-quota";
import { getRouterVpnQuotaFields } from "@/lib/billing/router-vpn-quota";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getSafecoinAccount } from "@/lib/safecoin/ledger";
import { chargeVpnActivation } from "@/lib/safecoin/service-charges";
import { allocatePortForward, getRelayPublicHost, revokePortForward } from "./relay";
import { isWebAccessService } from "./remote-access-host";
import {
  evaluateRemoteAccessGate,
  consumeRemoteAccessAuthorization,
} from "@/lib/billing/remote-access-authorization-service";
import { connectToRouter } from "./router-sync";
import type { RouterOSClient } from "./client";
import { ensureMikhmonTunnelAccess } from "./mikhmon-tunnel-access";
import { ensureSshTunnelAccess } from "./ssh-tunnel-access";
import { getPortForwardTargetPort } from "./port-forward-rules";
import { PERIOD_PRICE_CENTS, BILLING_PERIOD_MONTHS, type BillingPeriod } from "./billing-plans";
import { getWalletBalanceCents } from "@/lib/wallet/balance";
import { messageSoldeInsuffisant, verdictDebitWallet } from "./activation-billing";
import { ensureCloudMikhmonInstance, removeCloudMikhmonInstance } from "./mikhmon-cloud";
import { parseEdition } from "./mikhmon-editions";
import { normalizeCustomSlug } from "./mikhmon-cloud-domain";
import { supportsContainersFor } from "./device-catalog";

export type { BillingPeriod } from "./billing-plans";

/**
 * "No VPN client needed" remote access: a public relay_ip:port that DNATs
 * straight to a connected router's WinBox (8291) or WebFig (80) port, so
 * any device — phone or PC, no app install, no VPN config — can just point
 * WinBox or a browser at it directly. Trade-off: that port is then
 * reachable by anyone who finds it, protected only by the router's own
 * login, same exposure model as giving the router a public IP.
 */

// provisionHotspotStack's hardening step disables RouterOS's own ssh
// service (/ip/service set ssh disabled=yes) — without re-enabling it here,
// toggling on the "ssh" relay forward just opens a public port to nothing,
// and tools like FileZilla (SFTP) get connection-refused even though the
// forward itself looks "Public" in the UI.
async function setSshServiceEnabled(client: RouterOSClient, enabled: boolean) {
  await client.talk(["/ip/service/set", "=numbers=ssh", `=disabled=${enabled ? "no" : "yes"}`]);
}

export async function listPortForwards(routerId: string) {
  const session = await getSession();
  if (!session) return [];

  const db = getDb();
  const [router] = await db
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) return [];

  return db
    .select()
    .from(routerPortForwards)
    .where(eq(routerPortForwards.routerId, routerId));
}

/** Core allocation logic. Callers are responsible for authorizing first. */
function expiresAtFor(period: BillingPeriod, from = new Date()): Date {
  const date = new Date(from);
  date.setMonth(date.getMonth() + BILLING_PERIOD_MONTHS[period]);
  return date;
}

async function enablePortForwardForRouter(
  routerId: string,
  service: string,
  billingPeriod: BillingPeriod = "monthly",
  isSuperAdminSession = false,
  expiresAtOverride: Date | null = null,
  billingPeriodLabel: string | null = null,
  edition: "v6" | "v7" = "v7",
  slug?: string,
) {
  const targetPort = getPortForwardTargetPort(service);
  if (!targetPort) return { error: "Unknown service." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router) {
    return { error: "Router not found." };
  }
  if (!router.tunnelIp || router.connectionMethod === "direct") {
    return {
      error: "Le routeur doit être connecté via WireGuard ou OpenVPN pour activer l'accès direct.",
    };
  }
  /* Même déduction que l'écran MikHmon : sans elle, la page classait un
     RB951 « sans conteneur » d'après son modèle pendant que cette voie, qui
     ne lisait que la colonne, refusait de lui créer son instance. */
  const isCloudMikhmon =
    service === "mikhmon" &&
    supportsContainersFor(router.supportsContainers, router.model) === false;

  const existing = await db
    .select()
    .from(routerPortForwards)
    .where(
      and(
        eq(routerPortForwards.routerId, routerId),
        eq(routerPortForwards.service, service),
        eq(routerPortForwards.status, "active"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    const [cloud] = isCloudMikhmon
      ? await db
          .select({ domain: routerMikhmonCloudInstances.domain })
          .from(routerMikhmonCloudInstances)
          .where(eq(routerMikhmonCloudInstances.routerId, routerId))
          .limit(1)
      : [undefined];
    return {
      success: true,
      publicPort: existing[0].publicPort,
      relayHost: getRelayPublicHost(router.relayShard),
      cloudDomain: cloud?.domain ?? null,
      created: false as const,
    };
  }

  if (isCloudMikhmon) {
    let cloud;
    try {
      cloud = await ensureCloudMikhmonInstance(router, edition, slug);
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? `Cloud MikHmon could not be provisioned: ${err.message}`
            : "Cloud MikHmon could not be provisioned.",
      };
    }

    const [forward] = await db
      .insert(routerPortForwards)
      .values({
        routerId,
        service,
        // These values preserve the existing billing/access-record contract.
        // The port is loopback-only on the VPS and is never passed to the
        // public relay DNAT allocator.
        targetPort: cloud.localPort,
        publicPort: cloud.localPort,
        tunnelIp: router.tunnelIp,
        status: "active",
        billingPeriod: billingPeriodLabel ?? billingPeriod,
        expiresAt: expiresAtOverride ?? expiresAtFor(billingPeriod),
      })
      .returning();

    return {
      success: true,
      publicPort: forward.publicPort,
      relayHost: getRelayPublicHost(router.relayShard),
      cloudDomain: cloud.domain,
      created: true as const,
      forwardId: forward.id,
    };
  }

  if (service === "mikhmon" || service === "ssh") {
    let client: RouterOSClient | null = null;
    try {
      client = await connectToRouter(router);
      if (service === "mikhmon") await ensureMikhmonTunnelAccess(client);
      if (service === "ssh") await ensureSshTunnelAccess(client, [], router.username ?? undefined);
    } catch {
      // Router is unreachable (offline, tunnel down) — proceed with port
      // allocation anyway so the forward exists and is usable the moment
      // the router reconnects. SSH / MikHmon NAT will be applied on the
      // next successful connection or when the admin retries manually.
    } finally {
      client?.close();
    }
  }

  let publicPort: number;
  try {
    const result = await allocatePortForward(
      router.tunnelIp,
      targetPort,
      router.relayShard,
      isWebAccessService(service),
    );
    publicPort = result.publicPort;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Could not allocate port forward: ${err.message}`
          : "Could not allocate port forward.",
    };
  }

  // An org the superadmin has granted unlimited VPN quota never actually
  // expires, however the access was activated (manual toggle or the
  // auto-enable that fires right after a fresh install) — store no expiry
  // so this isn't just a display quirk: anything that later enforces
  // expiresAt also sees it as never-expiring.
  const quotaFields = await getRouterVpnQuotaFields(routerId, router.orgId);
  const isUnlimited = isSuperAdminSession || getVpnQuotaStatus(quotaFields).unlimited;

  const [forward] = await db
    .insert(routerPortForwards)
    .values({
      routerId,
      service,
      targetPort,
      publicPort,
      tunnelIp: router.tunnelIp,
      status: "active",
      billingPeriod: billingPeriodLabel ?? billingPeriod,
      expiresAt: isUnlimited ? null : expiresAtOverride ?? expiresAtFor(billingPeriod),
    })
    .returning();

  return {
    success: true,
    publicPort,
    relayHost: getRelayPublicHost(router.relayShard),
    created: true as const,
    forwardId: forward.id,
  };
}

/**
 * Charges the org's wallet for a newly-activated plan — split out from
 * enablePortForwardForRouter so only an admin explicitly choosing a plan
 * through the authenticated action below ever gets billed.
 */
async function chargeWalletForActivation(opts: {
  orgId: string;
  userId: string;
  forwardId: string;
  service: string;
  billingPeriod: BillingPeriod;
  routerName: string;
}) {
  const db = getDb();
  await db.insert(walletTransactions).values({
    orgId: opts.orgId,
    type: "charge",
    amountCents: PERIOD_PRICE_CENTS[opts.billingPeriod],
    note: `${opts.service} — ${opts.routerName}`,
    relatedForwardId: opts.forwardId,
    createdBy: opts.userId,
  });
}

export async function enablePortForward(
  routerId: string,
  service: string,
  billingPeriod: BillingPeriod = "monthly",
  /* Édition MikHmon choisie à l'écran. Traversée en clair depuis le client :
     `parseEdition` la ramène de toute façon à v6 ou v7, donc rien d'inattendu
     n'atteint le nom d'image passé à `docker run`. */
  editionRaw?: string,
  /* Sous-domaine choisi à l'écran. Vide = celui dérivé du nom du routeur. */
  slugRaw?: string,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  /* Refus AVANT tout travail : un sous-domaine invalide doit répondre par la
     phrase que l'exploitant peut corriger, pas par une erreur de Traefik une
     minute plus tard. Vide = on garde le nom dérivé, ce n'est pas une erreur. */
  let slugValide: string | undefined;
  if (slugRaw && slugRaw.trim()) {
    const verdict = normalizeCustomSlug(slugRaw);
    if (!verdict.ok) return { error: verdict.erreur };
    slugValide = verdict.slug;
  }

  const db = getDb();
  const [router] = await db
    .select({ orgId: routers.orgId, name: routers.name })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Router not found." };
  }

  const [org] = await db
    .select({ createdAt: organizations.createdAt })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  // Quota applicable à CE routeur : sa surcharge si le superadmin lui en a
  // posé une, sinon celui de l'organisation.
  const quotaFields = await getRouterVpnQuotaFields(routerId, session.orgId);

  // TEMPORAIRE — porte de monétisation manuelle : hors superadmin, activer un
  // accès distant exige une autorisation validée (et non consommée) pour ce
  // (routeur, service). C'est le verrou serveur, indépendant de l'UI. Ne
  // s'applique à toute activation exposant un port public. TODO: Remplacer
  // par système de paiement intégré.
  const gate = await evaluateRemoteAccessGate(session, routerId, service);
  if (!gate.ok) {
    return {
      error:
        "Accès distant payant : votre paiement doit être validé par l'administrateur avant d'activer ce service.",
      needsAuthorization: true as const,
    };
  }

  const superadmin = isSuperAdmin(session.role);
  const quota = getVpnQuotaStatus(quotaFields);
  // A superadmin session is an operational override: it must not inherit the
  // organization owner's free-quota expiry when repairing or provisioning a
  // router from the admin account.
  const quotaExpiry = !superadmin && quota.free && quota.expiresAt ? quota.expiresAt : null;
  const temporaryGrantExpiry = gate.reason === "temporary_grant" ? gate.expiresAt : null;
  const planExpiry = expiresAtFor(billingPeriod);
  const freeExpiry = [quotaExpiry, temporaryGrantExpiry]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const effectiveExpiry = capVpnAccessExpiry(planExpiry, freeExpiry);
  const isFreeCapped = Boolean(freeExpiry && effectiveExpiry.getTime() === freeExpiry.getTime());
  const freeLabel = temporaryGrantExpiry && (!quotaExpiry || temporaryGrantExpiry <= quotaExpiry)
    ? "temporary_grant"
    : "free_until";

  const result = await enablePortForwardForRouter(
    routerId,
    service,
    billingPeriod,
    superadmin,
    isFreeCapped ? effectiveExpiry : null,
    isFreeCapped ? freeLabel : null,
    parseEdition(editionRaw),
    slugValide,
  );

  // Activation réussie via une autorisation manuelle : on la consomme (une par
  // paiement) et on NE débite PAS le wallet (paiement déjà fait hors-app).
  if (result.success && gate.reason === "authorized" && gate.authorizationId) {
    await consumeRemoteAccessAuthorization(gate.authorizationId);
  }

  if (result.success && result.created) {
    // Superadmin-granted VPN quota is separate from wallet transactions:
    // free_until/unlimited never writes a charge, paid forces charging, and
    // default preserves the original one-year trial behavior.
    const shouldCharge =
      // Paiement déjà réglé hors-app via l'autorisation manuelle → pas de
      // débit wallet en plus (la porte remplace la facturation wallet).
      gate.reason !== "authorized" &&
      gate.reason !== "temporary_grant" &&
      gate.reason !== "quota" &&
      shouldChargeVpnActivation({
        isSuperAdmin: isSuperAdmin(session.role),
        orgCreatedAt: org?.createdAt ?? null,
        vpnQuotaMode: quotaFields.vpnQuotaMode ?? "default",
        vpnQuotaExpiresAt: quotaFields.vpnQuotaExpiresAt,
      });

    if (shouldCharge) {
      // Les organisations qui ont déjà commencé à utiliser Safecoin sont
      // débitées en SC. Les organisations historiques sans compte SC gardent
      // le portefeuille FCFA jusqu'à leur première recharge Safecoin.
      const safecoinAccount = await getSafecoinAccount(session.orgId);
      if (safecoinAccount) {
        const charge = await chargeVpnActivation({
          orgId: session.orgId,
          userId: session.userId,
          forwardId: result.forwardId,
          service,
          billingPeriod,
          routerName: router.name,
        });
        if (!charge.created) {
          // Ne pas laisser un accès public actif sans paiement confirmé.
          await disablePortForward(result.forwardId);
          return {
            error:
              charge.error === "INSUFFICIENT_BALANCE"
                ? "Solde Safecoin insuffisant pour activer cet accès distant."
                : "Le débit Safecoin n'a pas pu être confirmé.",
          };
        }
      } else {
        /* LE SOLDE EST VÉRIFIÉ AVANT LE DÉBIT, comme sur la voie Safecoin.
           Cette branche écrivait la ligne de charge sans jamais le regarder :
           un portefeuille vide — ou déjà négatif — laissait l'accès s'ouvrir.
           Deux comportements opposés pour un même geste, selon l'ancienneté de
           l'organisation. */
        const solde = await getWalletBalanceCents(session.orgId);
        const verdict = verdictDebitWallet(solde, PERIOD_PRICE_CENTS[billingPeriod]);
        if (!verdict.ok) {
          // Même règle que Safecoin : pas d'accès ouvert sans paiement.
          await disablePortForward(result.forwardId);
          return { error: messageSoldeInsuffisant(verdict.manqueCents) };
        }
        await chargeWalletForActivation({
          orgId: session.orgId,
          userId: session.userId,
          forwardId: result.forwardId,
          service,
          billingPeriod,
          routerName: router.name,
        });
      }
    }
  }

  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/mikhmon-online");
  revalidatePath("/admin/router");
  revalidatePath("/admin/billing");
  return result;
}

export async function disablePortForward(forwardId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [forward] = await db
    .select()
    .from(routerPortForwards)
    .where(eq(routerPortForwards.id, forwardId))
    .limit(1);
  if (!forward) return { error: "Forward not found." };

  const [router] = await db
    .select({ orgId: routers.orgId })
    .from(routers)
    .where(eq(routers.id, forward.routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Forward not found." };
  }

  const [cloud] =
    forward.service === "mikhmon"
      ? await db
          .select({ id: routerMikhmonCloudInstances.id })
          .from(routerMikhmonCloudInstances)
          .where(eq(routerMikhmonCloudInstances.routerId, forward.routerId))
          .limit(1)
      : [undefined];
  try {
    if (cloud) {
      await removeCloudMikhmonInstance(forward.routerId);
    } else {
      await revokePortForward(
        forward.tunnelIp,
        forward.targetPort,
        forward.publicPort,
        isWebAccessService(forward.service),
      );
    }
  } catch (err) {
    return {
      error: err instanceof Error ? `Could not revoke: ${err.message}` : "Could not revoke.",
    };
  }

  if (forward.service === "ssh") {
    const [fullRouter] = await db
      .select()
      .from(routers)
      .where(eq(routers.id, forward.routerId))
      .limit(1);
    if (fullRouter) {
      let client: RouterOSClient | null = null;
      try {
        client = await connectToRouter(fullRouter);
        await setSshServiceEnabled(client, false);
      } catch {
        // Non-fatal — the public forward is already gone, so ssh isn't
        // reachable from outside anymore even if the service stays on.
      } finally {
        client?.close();
      }
    }
  }

  await db.delete(routerPortForwards).where(eq(routerPortForwards.id, forwardId));

  revalidatePath("/admin/remote-access");
  revalidatePath("/admin/router");
  return { success: true };
}
