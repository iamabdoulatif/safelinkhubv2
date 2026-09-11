"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import type { RouterOSClient } from "./client";
import { connectToRouter } from "./router-sync";
import { detectUplinkInterface } from "./router-lock";
import {
  applyGuardPlan,
  buildGuardInstallPlan,
  buildGuardRemovalPlan,
  QUOTA_GUARD_DEFAULT_INTERVAL_MIN,
  readQuotaGuardState,
  renderGuardScript,
  quotaGuardCapLabel,
  type QuotaGuardState,
  type SavedQuotaGuard,
} from "./quota-guard";

/**
 * Server actions du garde-fou quota autonome. Comme content-filter-actions,
 * elles ne décident rien : le savoir RouterOS vit dans quota-guard.ts
 * (testable sans routeur). Ici on authentifie, ouvre la connexion, détecte
 * l'interface WAN si besoin, et rapporte l'état RELU sur le routeur.
 */

type Acces = { ok: false; error: string } | { ok: true; client: RouterOSClient };

async function ouvrir(routerId: string): Promise<Acces> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { ok: false, error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { ok: false, error: "Détails de connexion du routeur manquants." };
  }

  try {
    return { ok: true, client: await connectToRouter(router, 20000) };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne — sinon utilisez le script à coller.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
}

async function lireMemo(routerId: string): Promise<SavedQuotaGuard | null> {
  const session = await getSession();
  if (!session) return null;
  const [router] = await getDb().select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) return null;
  return router.quotaGuard ?? null;
}

async function memoriser(routerId: string, saved: SavedQuotaGuard) {
  await getDb().update(routers).set({ quotaGuard: saved }).where(eq(routers.id, routerId));
}

export type QuotaGuardView = {
  error?: string;
  state?: QuotaGuardState;
  saved?: SavedQuotaGuard | null;
  /** Pourcentage du quota consommé, selon le routeur (null si illisible). */
  pct?: number | null;
};

/** État du garde-fou. `state` est relu SUR le routeur ; `saved` est le repli. */
export async function readRouterQuotaGuard(routerId: string): Promise<QuotaGuardView> {
  const saved = await lireMemo(routerId);
  const acces = await ouvrir(routerId);
  if (!acces.ok) return { error: acces.error, saved };

  try {
    const state = await readQuotaGuardState(acces.client, saved?.wanInterface ?? null);
    const pct =
      state.usedBytes != null && saved && saved.capMb > 0
        ? Math.min(999, (state.usedBytes / (saved.capMb * 1024 * 1024)) * 100)
        : null;
    return { state, saved, pct };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lecture impossible.", saved };
  } finally {
    acces.client.close();
  }
}

/**
 * Pose (ou re-pose) le garde-fou. `wanInterface` vide → détection automatique
 * de l'uplink sur le routeur. `capGo` est le quota mensuel en GO — l'unité de
 * l'écran ; on le convertit en Mo pour le mémo (cohérent avec wan_quota_mb).
 */
export async function applyRouterQuotaGuard(
  routerId: string,
  input: { capGo: number; throttleMbps: number; wanInterface?: string; intervalMinutes?: number },
) {
  const capMb = Math.round(input.capGo * 1024);
  const throttleKbps = Math.round(input.throttleMbps * 1000);
  const intervalMinutes = Math.max(1, Math.round(input.intervalMinutes ?? QUOTA_GUARD_DEFAULT_INTERVAL_MIN));
  if (!Number.isFinite(capMb) || capMb <= 0) return { error: "Indiquez un quota mensuel valide (en Go)." };
  if (!Number.isFinite(throttleKbps) || throttleKbps < 64) {
    return { error: "Indiquez un débit de bride valide (en Mbps)." };
  }

  const acces = await ouvrir(routerId);
  if (!acces.ok) return { error: acces.error };
  const client: RouterOSClient = acces.client;

  try {
    const wanInterface =
      input.wanInterface?.trim() || (await detectUplinkInterface(client, 15000));
    if (!wanInterface) {
      return { error: "Interface WAN introuvable sur le routeur — indiquez-la à la main." };
    }

    const plan = buildGuardInstallPlan({ wanInterface, capMb, throttleKbps, intervalMinutes });
    const res = await applyGuardPlan(client, plan);
    const state = await readQuotaGuardState(client, wanInterface);

    await memoriser(routerId, {
      wanInterface,
      capMb,
      throttleKbps,
      intervalMinutes,
      updatedAt: new Date().toISOString(),
    });
    revalidatePath(`/admin/router/${routerId}`);

    if (!state.installed) {
      return {
        error:
          "Le routeur n'a pas confirmé la pose du garde-fou. " +
          (res.failed[0]?.error ?? "Aucune commande n'a abouti."),
        failed: res.failed,
        state,
      };
    }

    return {
      success: true,
      summary:
        `Garde-fou actif : quota ${quotaGuardCapLabel(capMb)}/mois sur ${wanInterface}, ` +
        `bride à ${input.throttleMbps} Mbps quand il est atteint, vérifié toutes les ${intervalMinutes} min par le routeur lui-même.`,
      notes: plan.notes,
      failed: res.failed,
      state,
    };
  } catch (err) {
    return { error: err instanceof Error ? `Échec de la pose : ${err.message}` : "Échec de la pose." };
  } finally {
    client.close();
  }
}

/** Retire le garde-fou du routeur (script + scheduler + file). */
export async function removeRouterQuotaGuard(routerId: string) {
  const acces = await ouvrir(routerId);
  if (!acces.ok) return { error: acces.error };
  const client: RouterOSClient = acces.client;

  try {
    const plan = buildGuardRemovalPlan();
    const res = await applyGuardPlan(client, plan);
    const state = await readQuotaGuardState(client, null);
    await memoriser(routerId, {
      ...(await lireMemo(routerId)) ?? {
        wanInterface: "",
        capMb: 0,
        throttleKbps: 0,
        intervalMinutes: QUOTA_GUARD_DEFAULT_INTERVAL_MIN,
      },
      updatedAt: new Date().toISOString(),
    });
    // Le mémo garde les valeurs mais l'écran se fie à `state.installed`.
    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      summary: state.installed
        ? "Le routeur porte encore des résidus du garde-fou (voir les échecs ci-dessous)."
        : "Garde-fou retiré du routeur : le lien n'est plus bridé au quota.",
      failed: res.failed,
      state,
    };
  } catch (err) {
    return { error: err instanceof Error ? `Échec de la dépose : ${err.message}` : "Échec de la dépose." };
  } finally {
    client.close();
  }
}

/**
 * Script `.rsc` à coller dans le terminal du routeur — utile quand le routeur
 * n'est pas joignable par l'API. L'interface WAN doit être indiquée à la main
 * dans ce cas.
 */
export async function buildRouterQuotaGuardScript(
  routerId: string,
  input: { capGo: number; throttleMbps: number; wanInterface: string; intervalMinutes?: number },
) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!input.wanInterface?.trim()) return { error: "Indiquez l'interface WAN (ex. ether1)." };

  const plan = buildGuardInstallPlan({
    wanInterface: input.wanInterface.trim(),
    capMb: Math.round(input.capGo * 1024),
    throttleKbps: Math.round(input.throttleMbps * 1000),
    intervalMinutes: input.intervalMinutes ?? QUOTA_GUARD_DEFAULT_INTERVAL_MIN,
  });
  return {
    success: true,
    script: renderGuardScript(plan),
    uninstallScript: renderGuardScript(buildGuardRemovalPlan()),
    notes: plan.notes,
  };
}
