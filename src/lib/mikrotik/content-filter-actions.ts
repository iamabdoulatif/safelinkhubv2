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
  findCategory,
  readContentFilterState,
  renderPlanScript,
  type ContentCategoryKey,
  type ContentFilterOptions,
  type ContentFilterState,
  type SavedContentFilter,
} from "./content-filter";

function normaliser(opts: ContentFilterOptions): SavedContentFilter {
  return {
    categories: opts.categories,
    keywords: opts.keywords !== false,
    forceDns: opts.forceDns !== false,
    adlist: opts.adlist !== false,
    updatedAt: new Date().toISOString(),
  };
}

async function memoriser(routerId: string, saved: SavedContentFilter) {
  await getDb().update(routers).set({ contentFilter: saved }).where(eq(routers.id, routerId));
}

/** Résumé chiffré du filtre tel qu'il est MAINTENANT sur le routeur. */
function resumer(state: ContentFilterState): string {
  return (
    `${state.dnsEntries} domaines au DNS, ${state.firewallRules} règles de firewall, ` +
    `${state.natRules} règles NAT` +
    (state.adlists.length > 0 ? `, ${state.adlists.length} liste(s) publique(s)` : "")
  );
}

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

/**
 * État du filtre. `state` est la vérité lue SUR le routeur ; `saved` est le
 * dernier réglage voulu, renvoyé même quand le routeur ne répond pas — sans
 * lui, l'écran rouvrirait sur ses cases par défaut et un « Ré-appliquer »
 * distrait re-poserait des catégories que l'admin avait retirées.
 */
export async function readRouterContentFilter(routerId: string): Promise<{
  error?: string;
  state?: ContentFilterState;
  saved?: SavedContentFilter | null;
}> {
  const saved = await lireMemo(routerId);
  const acces = await ouvrir(routerId);
  if (!acces.ok) return { error: acces.error, saved };
  const client: RouterOSClient = acces.client;
  try {
    return { state: await readContentFilterState(client), saved };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lecture impossible.", saved };
  } finally {
    client.close();
  }
}

async function lireMemo(routerId: string): Promise<SavedContentFilter | null> {
  const session = await getSession();
  if (!session) return null;
  const [router] = await getDb().select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) return null;
  return router.contentFilter ?? null;
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
    await memoriser(routerId, normaliser(opts));

    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      version: avant.rawVersion || `${plan.version.major}.${plan.version.minor}`,
      summary:
        `Filtre posé en RouterOS ${plan.version.major}.${plan.version.minor} : ` +
        resumer(apres) +
        ".",
      notes: plan.notes,
      failed: res.failed,
      state: apres,
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
    const apres = await readContentFilterState(client);
    await memoriser(routerId, normaliser({ categories: [] }));
    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      summary:
        `Filtre retiré (${avant.dnsEntries} entrées DNS, ${avant.firewallRules} règles de firewall, ` +
        `${avant.natRules} règles NAT, ${avant.adlists.length} liste(s) publique(s)). ` +
        "Le reste de la configuration du routeur n'a pas été touché.",
      failed: res.failed,
      state: apres,
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
 * Autorise ou re-bloque UNE catégorie, sans toucher aux autres.
 *
 * `blocked: false` ne purge que les ressources portant le commentaire de cette
 * catégorie — les autres catégories et le socle partagé (forçage DNS) restent
 * en place. `blocked: true` re-pose cette seule catégorie : on ne rejoue pas
 * les ~100 entrées DNS des autres pour en ajouter vingt.
 *
 * L'état renvoyé est RELU sur le routeur après l'écriture : c'est lui que
 * l'écran affiche, jamais ce qu'on croit avoir fait.
 */
export async function setRouterContentFilterCategory(
  routerId: string,
  key: ContentCategoryKey,
  blocked: boolean,
) {
  const categorie = findCategory(key);
  const memo = await lireMemo(routerId);

  const acces = await ouvrir(routerId);
  if (!acces.ok) return { error: acces.error };
  const client: RouterOSClient = acces.client;

  try {
    const avant = await readContentFilterState(client);
    // Filtre posé avant la découpe : tout y porte le commentaire nu. On refuse
    // les DEUX sens. Retirer une catégorie ne trouverait rien à retirer ; mais
    // surtout, en re-poser une purgerait d'abord le socle au commentaire nu —
    // c'est-à-dire, sur ce routeur-là, les domaines de TOUTES les autres
    // catégories, qui seraient silencieusement débloquées.
    if (avant.legacy) {
      return {
        error:
          `Ce routeur porte un filtre posé avant la découpe par catégorie : ses entrées ne sont ` +
          `attribuées à aucune catégorie, donc « ${categorie.label} » ne peut pas être traitée seule. ` +
          `Cliquez d'abord « Ré-appliquer le filtre » : les catégories cochées seront re-posées, ` +
          `chacune identifiable, et l'action à l'unité deviendra possible.`,
      };
    }

    const options = {
      keywords: memo?.keywords ?? true,
      forceDns: memo?.forceDns ?? true,
      adlist: memo?.adlist ?? true,
    };
    const plan = blocked
      ? buildInstallPlan(avant.rawVersion, { ...options, categories: [key] }, "selected")
      : buildUninstallPlan(avant.rawVersion, [key]);

    const res = await applyPlan(client, plan);
    const apres = await readContentFilterState(client);

    // Le mémo suit l'état RÉEL du routeur : sinon un « Ré-appliquer » plus tard
    // re-poserait la catégorie qu'on vient d'autoriser.
    await memoriser(routerId, { ...options, categories: apres.categories, updatedAt: new Date().toISOString() });
    revalidatePath(`/admin/router/${routerId}`);

    const toujoursLa = apres.categories.includes(key);
    if (blocked !== toujoursLa) {
      return {
        error:
          `Le routeur n'a pas appliqué le changement sur « ${categorie.label} » : ` +
          (res.failed[0]?.error ?? "aucune commande n'a abouti") +
          ".",
        failed: res.failed,
        state: apres,
      };
    }

    return {
      success: true,
      summary: blocked
        ? `« ${categorie.label} » est de nouveau bloquée. Filtre en place : ${resumer(apres)}.`
        : `« ${categorie.label} » est désormais autorisée sur ce routeur. ` +
          `Les autres catégories restent bloquées — filtre en place : ${resumer(apres)}.`,
      notes: plan.notes,
      failed: res.failed,
      state: apres,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Échec sur « ${categorie.label} » : ${err.message}`
          : `Échec sur « ${categorie.label} ».`,
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
