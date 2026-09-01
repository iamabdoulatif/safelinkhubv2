"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import type { RouterOSClient } from "./client";
import { connectToRouter } from "./router-sync";
import {
  applyPlan,
  buildInstallPlan,
  buildUninstallPlan,
  readContentFilterState,
  renderPlanScript,
  type ContentFilterOptions,
  type ContentFilterState,
} from "./content-filter";

/**
 * Server actions du filtrage de contenu. Elles ne décident rien : tout le
 * savoir RouterOS (et la divergence v6/v7) vit dans content-filter.ts, testable
 * sans routeur. Ici on ne fait qu'authentifier, ouvrir la connexion, et
 * rapporter.
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

export async function readRouterContentFilter(
  routerId: string,
): Promise<{ error: string } | { state: ContentFilterState }> {
  const acces = await ouvrir(routerId);
  if (!acces.ok) return { error: acces.error };
  const client: RouterOSClient = acces.client;
  try {
    return { state: await readContentFilterState(client) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lecture impossible." };
  } finally {
    client.close();
  }
}

export async function applyRouterContentFilter(routerId: string, opts: ContentFilterOptions) {
  if (opts.categories.length === 0) return { error: "Sélectionnez au moins une catégorie." };

  const acces = await ouvrir(routerId);
  if (!acces.ok) return { error: acces.error };
  const client: RouterOSClient = acces.client;

  try {
    // La version est lue SUR le routeur, jamais supposée : c'est elle qui
    // décide de la forme du blocage DNS et de la façon de couper les torrents.
    const avant = await readContentFilterState(client);
    const plan = buildInstallPlan(avant.rawVersion, opts);
    const res = await applyPlan(client, plan);
    const apres = await readContentFilterState(client);

    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      version: avant.rawVersion || `${plan.version.major}.${plan.version.minor}`,
      summary:
        `Filtre posé en RouterOS ${plan.version.major}.${plan.version.minor} : ` +
        `${apres.dnsEntries} domaines au DNS, ${apres.firewallRules} règles de firewall, ` +
        `${apres.natRules} règles NAT` +
        (apres.adlists.length > 0 ? `, ${apres.adlists.length} liste(s) publique(s)` : "") +
        ".",
      notes: plan.notes,
      failed: res.failed,
    };
  } catch (err) {
    return { error: err instanceof Error ? `Échec de la pose : ${err.message}` : "Échec de la pose." };
  } finally {
    client.close();
  }
}

export async function removeRouterContentFilter(routerId: string) {
  const acces = await ouvrir(routerId);
  if (!acces.ok) return { error: acces.error };
  const client: RouterOSClient = acces.client;

  try {
    const avant = await readContentFilterState(client);
    const res = await applyPlan(client, buildUninstallPlan(avant.rawVersion));
    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      summary:
        `Filtre retiré (${avant.dnsEntries} entrées DNS, ${avant.firewallRules} règles de firewall, ` +
        `${avant.natRules} règles NAT, ${avant.adlists.length} liste(s) publique(s)). ` +
        "Le reste de la configuration du routeur n'a pas été touché.",
      failed: res.failed,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec de la dépose : ${err.message}` : "Échec de la dépose.",
    };
  } finally {
    client.close();
  }
}

/**
 * Script à coller dans le terminal du routeur. Utile quand le routeur n'est pas
 * (encore) joignable par l'API : l'opérateur choisit alors la branche à la main
 * — d'où `versionOverride`. Si le routeur répond, sa vraie version l'emporte.
 */
export async function buildRouterContentFilterScript(
  routerId: string,
  opts: ContentFilterOptions,
  versionOverride?: string,
) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  if (opts.categories.length === 0) return { error: "Sélectionnez au moins une catégorie." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let version = versionOverride ?? null;
  let live = false;
  if (!version) {
    const acces = await ouvrir(routerId);
    if (acces.ok) {
      try {
        version = (await readContentFilterState(acces.client)).rawVersion;
        live = true;
      } catch {
        // routeur muet : on retombe sur la branche par défaut, signalée ci-dessous.
      } finally {
        acces.client.close();
      }
    }
  }

  const plan = buildInstallPlan(version, opts);
  return {
    success: true,
    live,
    version: `${plan.version.major}.${plan.version.minor}`,
    script: renderPlanScript(plan),
    uninstallScript: renderPlanScript(buildUninstallPlan(version)),
    notes: plan.notes,
  };
}
