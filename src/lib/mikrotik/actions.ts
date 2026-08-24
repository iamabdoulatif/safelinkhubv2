"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { eq, count, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, organizations } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/net/app-url";
import { RouterOSClient } from "./client";
import { encryptSecret } from "./crypto";
import { API_USERNAME, INSTALL_TOKEN_TTL_MS, hashToken } from "./install-token";
import { syncRouterStats, connectToRouter, refreshStaleRouters } from "./router-sync";
import { revokeVpnPeer, revokeOpenvpnPeer } from "./relay";
import { shardForIndex } from "./shards";
import { optimizeWifiThroughput, fixWifiDfs } from "./wifi-compat";
import { lockRouterInterfaces, unlockRouterInterfaces } from "./router-lock";
import {
  optimizeRouterThroughput as optimizeThroughput,
  runRouterSpeedTest,
  setRouterBandwidthCap as setBandwidthCap,
} from "./router-throughput";
import { auditRouter } from "./router-audit";
import {
  ensureApiGroupPolicy,
  rewriteIsoExpiryComments,
  repairExpirySweeps,
  unbindMacBoundTickets,
  upgradeRouterboardFirmware,
} from "./router-audit-fixes";
import { WIFI_ENABLE_ANY_VERSION } from "./provisioning-commands";
import { migrateMikhmonToFlash } from "./mikhmon-flash";
import { writeMikhmonSession } from "./mikhmon-session";
import { decryptSecret } from "./crypto";

/**
 * Relay shard for a newly-created router — round-robin over s1..s4 keyed on the
 * current router count, so the fleet stays evenly spread across shards. Stored
 * once at creation and never changed (see shards.ts / the relay-sharding spec).
 */
async function nextRelayShard(db: ReturnType<typeof getDb>): Promise<string> {
  const [row] = await db.select({ n: count() }).from(routers);
  return shardForIndex(Number(row?.n ?? 0));
}

export async function connectRouter(_prevState: unknown, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  // Lier un MikroTik est GRATUIT (plus d'approbation superadmin). La
  // facturation est portée par l'auto-setup (15 000 FCFA, payé en ligne) et par
  // les services d'accès distant (par onglet × durée), pas par le liage.

  const name = String(formData.get("name") ?? "").trim();
  const host = String(formData.get("host") ?? "").trim();
  const apiPort = Number(formData.get("apiPort") ?? 8728);
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !host || !username) {
    return { error: "Name, host, and username are required." };
  }

  const client = new RouterOSClient();
  let model = "Unknown";

  try {
    await client.connect(host, apiPort, username, password);
    const [resource] = await client.talk(["/system/resource/print"]);
    model = resource?.["board-name"] ?? "Unknown";
    // Push the admin-chosen name to the router itself instead of adopting
    // whatever identity it already had (often just the factory default).
    await client.talk(["/system/identity/set", `=name=${name}`]);
  } catch (err) {
    client.close();
    return {
      error:
        err instanceof Error
          ? `Could not connect to router: ${err.message}`
          : "Could not connect to router.",
    };
  } finally {
    client.close();
  }

  const db = getDb();
  await db.insert(routers).values({
    orgId: session.orgId,
    name,
    model,
    host,
    apiPort,
    username,
    passwordEncrypted: encryptSecret(password),
    status: "online",
    lastSyncAt: new Date(),
    relayShard: await nextRelayShard(db),
  });

  revalidatePath("/admin/router");
  revalidatePath("/admin/settings/router-setup");
  return { success: true };
}

export async function refreshRouterStats(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);

  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Router not found." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Router is missing connection details." };
  }

  const result = await syncRouterStats(routerId);
  if (!result.success) return { error: result.error };

  revalidatePath("/admin/router");
  return { success: true };
}

/**
 * OPTIMISE LE DÉBIT WiFi d'un routeur (bouton « Optimiser le WiFi » de la fiche
 * routeur) — le correctif « faible connexion » en un clic : unifie le SSID sur
 * les deux bandes (band steering → les appareils prennent la 5GHz rapide), met
 * la 5GHz en 80MHz et la 2.4GHz en 20MHz. Conserve le SSID existant. Ne touche
 * ni au hotspot ni aux forfaits.
 */
export async function optimizeRouterWifi(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour optimiser le WiFi.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await optimizeWifiThroughput(client);
    if (res.applied.length === 0) {
      // Pas de radio / pas de SSID / échec total : renvoyer un message clair.
      return res.failed.length > 0
        ? { error: `Optimisation refusée par le routeur : ${res.failed[0].error}` }
        : { error: res.note ?? res.summary };
    }
    revalidatePath("/admin/router");
    revalidatePath(`/admin/router/${routerId}`);
    return { success: true, summary: res.summary };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec de l'optimisation : ${err.message}` : "Échec de l'optimisation.",
    };
  } finally {
    client.close();
  }
}

/**
 * Correctif injectable « radio 5 GHz coincée en DFS » : pose un pays réglementaire
 * (si manquant) et force un canal NON-DFS (skip-dfs) sur chaque radio 5 GHz, pour
 * qu'elle sorte du « channel availability check » perpétuel et diffuse enfin.
 * Voir fixWifiDfs (validé sur RB4011 / RouterOS 7.23).
 */
export async function fixRouterWifiDfs(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour corriger le WiFi.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await fixWifiDfs(client);
    if (res.applied.length === 0) {
      return res.failed.length > 0
        ? { error: `Correctif refusé par le routeur : ${res.failed[0].error}` }
        : { error: res.note ?? "Aucune radio 5 GHz à corriger." };
    }
    revalidatePath("/admin/router");
    revalidatePath(`/admin/router/${routerId}`);
    const failedNote = res.failed.length > 0 ? ` (${res.failed.length} échec(s))` : "";
    return {
      success: true,
      summary: `Canal WiFi corrigé (non-DFS) sur : ${res.applied.join(", ")}${failedNote}. Comptez ~1 min de reprise.`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec du correctif WiFi : ${err.message}` : "Échec du correctif WiFi.",
    };
  } finally {
    client.close();
  }
}

/**
 * Correctif d'audit « firmware RouterBOARD périmé » : stage le firmware du
 * bootloader embarqué par le RouterOS courant (/system/routerboard/upgrade).
 * NE redémarre PAS — le firmware s'applique au prochain reboot (à planifier
 * hors-pointe). Idempotent : no-op si déjà à jour ou si ce n'est pas un
 * RouterBOARD.
 */
export async function upgradeRouterFirmware(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour mettre à niveau le firmware.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await upgradeRouterboardFirmware(client);
    if (!res.applied) {
      return {
        success: true,
        summary: res.routerboard
          ? `Firmware RouterBOARD déjà à jour (${res.current}).`
          : "Pas de RouterBOARD à mettre à niveau (firmware géré autrement).",
      };
    }
    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      summary: `Firmware RouterBOARD ${res.current} → ${res.target} stagé. Il s'appliquera au PROCHAIN redémarrage du routeur (à planifier hors-pointe) — aucune coupure pour l'instant.`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec de la mise à niveau firmware : ${err.message}` : "Échec de la mise à niveau firmware.",
    };
  } finally {
    client.close();
  }
}

/**
 * Correctif d'audit « MikHmon : tickets sans expiration & revenu absent » :
 * complète les permissions API du groupe de service (safelinkhub-group) —
 * notamment « policy », sans laquelle le MikHmon hébergé ne peut poser ni les
 * schedulers d'expiration ni le journal de revenu. Idempotent, sans coupure
 * (n'affecte que le compte de service).
 */
export async function fixRouterApiGroupPolicy(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour corriger les droits API.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await ensureApiGroupPolicy(client);
    if (!res.found) {
      return { error: "Groupe de service « safelinkhub-group » introuvable — relancez l'installation VPN du routeur." };
    }
    if (!res.applied) {
      return { success: true, summary: "Droits API déjà complets — MikHmon peut gérer expiration et revenu." };
    }
    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      summary: `Droits API complétés (ajout de ${res.missing.map((m) => `« ${m} »`).join(", ")}). Le MikHmon hébergé peut désormais faire expirer les tickets et afficher le revenu sur ce routeur.`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec de la correction des droits API : ${err.message}` : "Échec de la correction des droits API.",
    };
  } finally {
    client.close();
  }
}

/**
 * Délie les tickets épinglés à une adresse MAC, sur UN routeur.
 *
 * Le bug : la livraison du portail créait chaque compte hotspot avec le MAC vu
 * à l'achat, pour empêcher le partage du code. Les téléphones changent de MAC
 * privée régulièrement — le client revient quelques heures après avec une autre
 * adresse et son code est refusé. Corrigé à la source dans fulfill.ts ; cette
 * action répare les tickets DÉJÀ vendus.
 *
 * Les comptes de roaming (nom = MAC) sont épargnés : les délier casserait
 * l'auto-connexion inter-zones.
 */
export async function fixRouterMacBoundTickets(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour délier les tickets.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await unbindMacBoundTickets(client);
    revalidatePath(`/admin/router/${routerId}`);
    if (res.found === 0) {
      return {
        success: true,
        summary: `Aucun ticket épinglé sur ${router.name}.${res.skippedRoaming > 0 ? ` (${res.skippedRoaming} compte(s) de roaming épargné(s).)` : ""}`,
      };
    }
    return {
      success: true,
      summary: `${res.unbound}/${res.found} ticket(s) déliés sur ${router.name} — ils refonctionnent quel que soit l'appareil.${res.skippedRoaming > 0 ? ` ${res.skippedRoaming} compte(s) de roaming épargné(s).` : ""}`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec : ${err.message}` : "Échec du déliage des tickets.",
    };
  } finally {
    client.close();
  }
}

/**
 * Même correction, sur TOUT LE PARC de l'organisation (tous les routeurs pour
 * un superadmin). Chaque routeur est traité indépendamment : un routeur hors
 * ligne est signalé nommément et n'interrompt pas les autres.
 *
 * Idempotent — relancer après le retour d'un routeur ne retouche que lui.
 */
export async function fixAllRoutersMacBoundTickets(): Promise<
  | { error: string }
  | {
      success: true;
      routersScanned: number;
      found: number;
      unbound: number;
      skippedRoaming: number;
      repaired: string[];
      unreachable: string[];
    }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const fleet = await db
    .select()
    .from(routers)
    .where(
      isSuperAdmin(session.role) ? isNotNull(routers.id) : eq(routers.orgId, session.orgId),
    );
  if (fleet.length === 0) return { error: "Aucun routeur enregistré." };

  let unbound = 0;
  let found = 0;
  let skippedRoaming = 0;
  const repaired: string[] = [];
  const unreachable: string[] = [];

  for (const router of fleet) {
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch {
      unreachable.push(router.name);
      continue;
    }
    try {
      const res = await unbindMacBoundTickets(client);
      found += res.found;
      unbound += res.unbound;
      skippedRoaming += res.skippedRoaming;
      if (res.unbound > 0) repaired.push(`${router.name} (${res.unbound})`);
    } catch {
      unreachable.push(router.name);
    } finally {
      client.close();
    }
  }

  revalidatePath("/admin/router");
  return {
    success: true as const,
    routersScanned: fleet.length - unreachable.length,
    found,
    unbound,
    skippedRoaming,
    repaired,
    unreachable,
  };
}

/** Budget de temps d'un passage, sous la coupure Cloudflare (~100 s → 524).
 *  Le parc compte des dizaines de routeurs sondés en SÉRIE : sans borne, la
 *  Server Action était tuée en vol et l'opérateur n'apprenait ni ce qui avait
 *  été réparé, ni ce qui restait. On s'arrête proprement et on le dit. */
const BUDGET_FLOTTE_MS = 70_000;

/**
 * Même réparation, sur TOUT LE PARC de l'organisation (tous les routeurs pour
 * un superadmin).
 *
 * Chaque routeur est traité indépendamment : un routeur hors ligne est signalé
 * nommément et n'interrompt pas les autres. Idempotent — relancer après le
 * retour d'un routeur ne retouche que lui, puisqu'une date déjà au bon format
 * n'est plus reconnue comme de l'ISO. C'est cette idempotence qui rend le
 * découpage en plusieurs passages sûr : on relance, on continue.
 */
export async function fixAllRoutersTicketExpiryFormat(): Promise<
  | { error: string }
  | {
      success: true;
      routersScanned: number;
      found: number;
      rewritten: number;
      /** Balayages remis en service — le correctif de fond. */
      sweepsRepaired: number;
      repaired: string[];
      unreachable: string[];
      /** Routeurs non traités faute de temps — relancer pour les reprendre. */
      remaining: number;
    }
> {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const fleet = await db
    .select()
    .from(routers)
    .where(isSuperAdmin(session.role) ? isNotNull(routers.id) : eq(routers.orgId, session.orgId));
  if (fleet.length === 0) return { error: "Aucun routeur enregistré." };

  let found = 0;
  let rewritten = 0;
  let sweepsRepaired = 0;
  const repaired: string[] = [];
  const unreachable: string[] = [];
  const echeance = Date.now() + BUDGET_FLOTTE_MS;
  let traites = 0;

  for (const router of fleet) {
    if (Date.now() > echeance) break;
    traites++;
    let client: RouterOSClient;
    try {
      client = await connectToRouter(router);
    } catch {
      unreachable.push(router.name);
      continue;
    }
    try {
      /* Le balayage D'ABORD : réécrire des dates que personne ne lit ne
         supprimerait toujours rien. */
      const sweep = await repairExpirySweeps(client);
      sweepsRepaired += sweep.repaired;
      const res = await rewriteIsoExpiryComments(client);
      found += res.found;
      rewritten += res.rewritten;
      if (res.rewritten > 0 || sweep.repaired > 0) {
        const detail = [
          res.rewritten > 0 ? `${res.rewritten} date(s)` : null,
          sweep.repaired > 0 ? `${sweep.repaired} balayage(s)` : null,
        ].filter(Boolean).join(", ");
        repaired.push(`${router.name} (${detail})`);
      }
    } catch {
      unreachable.push(router.name);
    } finally {
      client.close();
    }
  }

  revalidatePath("/admin/router");
  return {
    success: true as const,
    routersScanned: traites - unreachable.length,
    found,
    rewritten,
    sweepsRepaired,
    repaired,
    unreachable,
    remaining: fleet.length - traites,
  };
}

/**
 * Remet en service le balayage d'expiration d'un routeur.
 *
 * C'est le correctif de FOND : tant que le balayage calcule un « aujourd'hui »
 * illisible, aucun ticket ne s'éteint, quel que soit le format des
 * commentaires. À appliquer avant — ou avec — la réécriture des dates.
 */
export async function fixRouterExpirySweep(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour réparer le balayage.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await repairExpirySweeps(client);
    if (res.stale === 0) {
      return { success: true, summary: `Les ${res.total} balayage(s) savent déjà lire l'horloge — rien à corriger.` };
    }
    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      summary:
        `${res.repaired} balayage(s) remis en service (${res.profiles.join(", ")})` +
        (res.failed > 0 ? `, ${res.failed} en échec` : "") +
        `. Les tickets périmés partiront au prochain passage (~2 min 30).`,
    };
  } finally {
    client.close();
  }
}

/**
 * Réécrit au format MikHmon les dates d'expiration rendues en ISO.
 *
 * Ne supprime AUCUN ticket : rend seulement les dates lisibles par le balayage
 * déjà installé sur le routeur, qui retirera les périmés à son passage suivant
 * (toutes les ~2 min 30). Laisser le routeur décider évite qu'un correctif du
 * SaaS et les règles du profil se contredisent.
 */
export async function fixRouterTicketExpiryFormat(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour corriger les dates.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await rewriteIsoExpiryComments(client);
    if (res.found === 0) {
      return { success: true, summary: "Aucune date au mauvais format — rien à corriger." };
    }
    revalidatePath(`/admin/router/${routerId}`);
    return {
      success: true,
      summary:
        `${res.rewritten} date(s) d'expiration réécrites au format MikHmon` +
        (res.failed > 0 ? `, ${res.failed} en échec` : "") +
        `. Le balayage du routeur retirera les tickets périmés à son prochain passage (~2 min 30).`,
    };
  } finally {
    client.close();
  }
}

/**
 * VERROUILLE le routeur (« kill-switch ») : coupe tous les ports d'accès + le
 * WiFi sauf ether1. Sert à paralyser un routeur à distance (ex. client qui n'a
 * pas payé) tout en gardant le tunnel de gestion vivant pour le déverrouiller.
 * Mémorise les interfaces coupées pour un déverrouillage exact.
 */
export async function lockRouterPorts(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) return { error: "Routeur introuvable." };
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour être verrouillé.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await lockRouterInterfaces(client);
    await db
      .update(routers)
      .set({ portsLockedAt: new Date(), lockedInterfaces: res.locked })
      .where(eq(routers.id, routerId));
    revalidatePath("/admin/router");
    revalidatePath(`/admin/router/${routerId}`);
    const n = res.locked.length + res.alreadyDisabled.length;
    return {
      success: true,
      summary: `Routeur verrouillé — ${n} interface(s) coupée(s), seul le WAN (${res.kept.join(", ")}) reste actif.`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Échec du verrouillage.",
    };
  } finally {
    client.close();
  }
}

/** DÉVERROUILLE le routeur : réactive les interfaces coupées par lockRouterPorts. */
export async function unlockRouterPorts(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) return { error: "Routeur introuvable." };
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour être déverrouillé.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await unlockRouterInterfaces(client, router.lockedInterfaces ?? null);
    await db
      .update(routers)
      .set({ portsLockedAt: null, lockedInterfaces: null })
      .where(eq(routers.id, routerId));
    revalidatePath("/admin/router");
    revalidatePath(`/admin/router/${routerId}`);
    if (res.failed.length > 0) {
      return {
        success: true,
        summary: `Routeur déverrouillé — ${res.enabled.length} interface(s) réactivée(s), ${res.failed.length} en échec (${res.failed[0].name} : ${res.failed[0].error}).`,
      };
    }
    return { success: true, summary: `Routeur déverrouillé — ${res.enabled.length} interface(s) réactivée(s).` };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec du déverrouillage : ${err.message}` : "Échec du déverrouillage.",
    };
  } finally {
    client.close();
  }
}

/**
 * OPTIMISE LE DÉBIT routé (bouton « Optimiser le débit ») : fasttrack des
 * connexions établies + désactivation des règles layer7 (tueur de débit).
 * Garde le filtrage tls-host/ports intact. Idempotent.
 */
export async function optimizeRouterThroughput(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour optimiser le débit.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await optimizeThroughput(client);
    revalidatePath(`/admin/router/${routerId}`);
    return { success: true, summary: res.summary };
  } catch (err) {
    return {
      error: err instanceof Error ? `Échec de l'optimisation débit : ${err.message}` : "Échec de l'optimisation débit.",
    };
  } finally {
    client.close();
  }
}

/**
 * CORRECTIF « MikHmon en RAM » : déplace le conteneur MikHmon du tmpfs vers la
 * flash NAND (persistant). Long (re-pull de l'image) → lancé en ARRIÈRE-PLAN
 * (after) pour éviter la coupure Cloudflare ~100 s ; l'utilisateur ré-analyse
 * ensuite pour confirmer.
 */
/**
 * Redirige l'accès distant MikHmon vers le conteneur RÉELLEMENT présent.
 *
 * Rejoue ensureMikhmonTunnelAccess, qui lit désormais l'adresse du conteneur
 * sur l'appareil au lieu de supposer celle de la veth SafeLinkHub, et redresse
 * une règle existante mal dirigée. Idempotent, et synchrone : l'opérateur doit
 * savoir tout de suite si c'était bien ça.
 */
/**
 * Démarre le conteneur MikHmon arrêté.
 *
 * Un conteneur arrêté est la cause la plus directe d'un accès distant qui
 * expire : le réseau a beau être parfaitement configuré, rien n'écoute au bout.
 * Cette ligne d'audit n'avait pourtant aucun bouton — il fallait ouvrir WinBox.
 *
 * Synchrone et borné : on démarre, puis on vérifie réellement que le conteneur
 * est passé en marche, au lieu d'annoncer un succès sur la seule absence
 * d'erreur. RouterOS accepte /container/start sans broncher même quand le
 * démarrage échouera ensuite (image absente, veth arrachée).
 */
/**
 * Réinstalle le conteneur MikHmon : arrêt, suppression, recréation, démarrage.
 *
 * L'escalade au-dessus de « Démarrer MikHmon », pour un conteneur que le
 * démarrage ne récupère plus (image corrompue, veth arrachée). Le conteneur
 * est recréé AU MÊME EMPLACEMENT — une installation sur clé USB y reste, la
 * remettre sur la flash interne casserait les boards dont elle est trop petite.
 *
 * En arrière-plan : le re-téléchargement de l'image prend 1 à 3 minutes, bien
 * au-delà de ce qu'une action HTTP peut tenir.
 */
export async function startMikhmonContainer(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 20000);
  } catch (err) {
    return { error: err instanceof Error ? `Routeur injoignable : ${err.message}` : "Routeur injoignable." };
  }

  // RouterOS ≤7.22 rapporte « status », 7.23+ le booléen « running ».
  const readStatus = (row: Record<string, string> | undefined) =>
    String(
      row?.status ?? (row?.running === "true" ? "running" : row?.running === "false" ? "stopped" : ""),
    ).toLowerCase();

  try {
    const rows = await client.talk(["/container/print"]);
    const container = rows.find(
      (row) =>
        /mikhmon/i.test(String(row.name ?? "")) ||
        /mikhmon/i.test(String(row["root-dir"] ?? "")) ||
        /mikhmon/i.test(String(row.tag ?? "")),
    );
    if (!container?.[".id"]) {
      return {
        error:
          "Aucun conteneur MikHmon sur ce routeur. Lancez l'auto-setup pour l'installer.",
      };
    }
    if (readStatus(container) === "running") {
      return { success: true, summary: "Le conteneur MikHmon tourne déjà." };
    }

    await client.talk(["/container/start", `=numbers=${container[".id"]}`]);

    // Vérification réelle : jusqu'à ~15 s, le temps que RouterOS bascule l'état.
    let status = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const fresh = await client.talk(["/container/print"]).catch(() => []);
      status = readStatus(fresh.find((row) => row[".id"] === container[".id"]));
      if (status === "running") break;
    }

    if (status !== "running") {
      const logs = await client
        .talk(["/log/print"], 8000)
        .catch(() => [] as Record<string, string>[]);
      const hint = logs
        .filter((row) => /container/i.test(`${row.topics ?? ""} ${row.message ?? ""}`))
        .slice(-3)
        .map((row) => row.message ?? "")
        .join(" · ");
      return {
        error:
          `Démarrage demandé, mais le conteneur est resté « ${status || "sans état"} ».` +
          (hint ? ` Journal du routeur : ${hint}` : " Regardez /log sur le routeur."),
      };
    }

    return {
      success: true,
      summary: "Conteneur MikHmon démarré. L'accès distant devrait répondre dans quelques secondes.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Le routeur a refusé l'opération." };
  } finally {
    client.close();
  }
}

export async function repairMikhmonRemoteAccess(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 20000);
  } catch (err) {
    return { error: err instanceof Error ? `Routeur injoignable : ${err.message}` : "Routeur injoignable." };
  }
  const log: string[] = [];
  try {
    const { ensureMikhmonTunnelAccess } = await import("./mikhmon-tunnel-access");
    await ensureMikhmonTunnelAccess(client, log);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Le routeur a refusé l'opération." };
  } finally {
    client.close();
  }

  return {
    success: true,
    summary: log.length
      ? log.join(" · ")
      : "Aucun changement : la règle visait déjà le bon conteneur.",
  };
}

export async function repairMikhmonStorage(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  after(async () => {
    let client: RouterOSClient | null = null;
    try {
      client = await connectToRouter(router, 30000);
      await migrateMikhmonToFlash(client);
    } catch {
      /* arrière-plan : l'utilisateur constatera l'état via une ré-analyse */
    } finally {
      client?.close();
    }
  });

  return {
    success: true,
    summary:
      "Migration de MikHmon vers la flash lancée (~1 à 3 min : re-téléchargement de l'image). Ré-analysez ensuite pour confirmer, puis recréez la session une dernière fois.",
  };
}

/**
 * RECONFIGURE la session MikHmon (« SafeLinkHub ») : réécrit le config.php du
 * conteneur avec les valeurs dérivées du routeur (hotspot = nom du Server
 * Profile, DNS = passerelle, IP/API fixes). Utilisé par le bouton du Diagnostic.
 */
export async function reconfigureMikhmonSession(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 30000);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const conts = await client.talk(["/container/print", "=detail"]).catch(() => [] as Record<string, string>[]);
    const mk = conts.find(
      (c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")),
    );
    if (!mk?.[".id"]) return { error: "Aucun conteneur MikHmon sur ce routeur." };
    const rootDir = String(mk["root-dir"] ?? "").replace(/^\//, "");

    const profs = await client.talk(["/ip/hotspot/profile/print", "=detail"]).catch(() => [] as Record<string, string>[]);
    const prof = profs.find((p) => p.name && p.name !== "default") ?? {};
    const hotspot = String(prof.name ?? router.name);
    const dns = String(prof["hotspot-address"] ?? "");

    const wrote = await writeMikhmonSession(
      client,
      rootDir,
      "SafeLinkHub",
      {
        ip: "11.11.11.1",
        user: router.username,
        pass: decryptSecret(router.passwordEncrypted),
        hotspot,
        dns,
        currency: "fcfa",
        autoload: 10,
        iface: 1,
        infolp: "",
        idle: "disable",
        livereport: "enable",
      },
      mk[".id"],
    );
    if (!wrote.ok) return { error: `Écriture impossible : ${wrote.error}` };
    await db.update(routers).set({ mikhmonSessionAt: new Date() }).where(eq(routers.id, routerId));
    revalidatePath(`/admin/router/${routerId}`);
    return { success: true, summary: `Session MikHmon « SafeLinkHub » reconfigurée (hotspot ${hotspot}, DNS ${dns}).` };
  } catch (err) {
    return { error: err instanceof Error ? `Échec : ${err.message}` : "Échec de la reconfiguration." };
  } finally {
    client.close();
  }
}

/**
 * AUDIT MikroTik : analyse (lecture seule) la config du routeur au regard des
 * bonnes pratiques de l'auto-setup et renvoie les constats + correctifs. Utilisé
 * par l'outil « Diagnostic » de la fiche routeur.
 */
export async function runRouterAudit(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 30000);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour l'analyse.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const audit = await auditRouter(client, { mikhmonConfigured: Boolean(router.mikhmonSessionAt) });
    return { success: true, audit };
  } catch (err) {
    return { error: err instanceof Error ? `Échec de l'analyse : ${err.message}` : "Échec de l'analyse." };
  } finally {
    client.close();
  }
}

/**
 * PLAFOND DÉBIT (« Débit maximal ») : pose/retire un plafond agrégé + partage
 * équitable par client (PCQ) sur le hotspot. targetMbps=0 retire le plafond.
 */
export async function setRouterBandwidthCap(routerId: string, targetMbps: number) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const target = Math.max(0, Math.min(2000, Math.round(Number(targetMbps) || 0)));

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await setBandwidthCap(client, target);
    revalidatePath(`/admin/router/${routerId}`);
    return { success: true, summary: res.summary };
  } catch (err) {
    return { error: err instanceof Error ? `Échec : ${err.message}` : "Échec du plafond de débit." };
  } finally {
    client.close();
  }
}

/**
 * TEST DÉBIT (bouton « Test débit ») : mesure le débit descendant réel du WAN
 * du routeur — il télécharge un fichier de test via SA connexion Internet, le
 * tunnel ne porte que le déclenchement + le résultat.
 */
export async function speedTestRouter(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { error: "Détails de connexion du routeur manquants." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 90000);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour tester le débit.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const res = await runRouterSpeedTest(client);
    return { success: true, summary: res.summary, downMbps: res.downMbps };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Échec du test de débit.",
    };
  } finally {
    client.close();
  }
}

/** Resynchronise tous les routeurs de l'organisation (bouton "Synchroniser"
 * de la liste) — délègue à refreshStaleRouters avec un seuil nul pour forcer
 * la lecture même des routeurs synchronisés récemment. */
export async function refreshAllRouters() {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  await refreshStaleRouters(session.orgId, 0);

  revalidatePath("/admin/router");
  return { success: true };
}

export async function generateInstallScript(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  // Créer un tunnel d'accès distant est GRATUIT (plus d'approbation superadmin) :
  // la facturation VPN est portée par les services activés (par onglet × durée).

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Router name is required." };

  const db = getDb();
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found." };

  // The VPN peer itself is allocated lazily when the router actually fetches
  // the script (see the install-vpn route handler) so that the peer's
  // private key never needs to be persisted server-side.
  const apiPassword = randomBytes(18).toString("base64url");
  const installToken = randomUUID();

  const [router] = await db
    .insert(routers)
    .values({
      orgId: session.orgId,
      name,
      apiPort: 8728,
      username: API_USERNAME,
      passwordEncrypted: encryptSecret(apiPassword),
      status: "pending",
      connectionMethod: "vpn",
      installTokenHash: hashToken(installToken),
      installTokenExpiresAt: new Date(Date.now() + INSTALL_TOKEN_TTL_MS),
      relayShard: await nextRelayShard(db),
    })
    .returning();

  const appUrl = getAppUrl();

  const scriptUrl = `${appUrl}/api/router/v1/${org.slug}/scripts/install-vpn`;
  const fetchMode = scriptUrl.startsWith("https://") ? "https" : "http";
  // [find name=ether1] resolves to the port's real internal .id under the
  // hood — unlike passing "ether1" as the API's bare =numbers= convenience
  // (which doesn't reliably resolve for physical ethernet ports, see
  // container-setup.ts's WAN rename), the RouterOS CLI's own [find ...]
  // selector always does. A no-op (not an error) if ether1 doesn't exist
  // or was already renamed, so this is safe to run on every install.
  // WIFI_ENABLE_ANY_VERSION enables every WiFi radio the board has (no-op if
  // it has none) — just the on/off flag here, not the band/width/SSID/country
  // tuning provisionHotspotStack does, since this one-shot script only ever
  // runs the VPN install, not the full auto-setup. It is version-tolerant
  // (RouterOS 7.9 → 7.23.x): the WiFi menu path differs across versions/drivers
  // (/interface/wifi vs /interface/wifiwave2 vs /interface/wireless) and a
  // missing menu would otherwise fail at PARSE time and abort the whole pasted
  // line — see provisioning-commands.ts.
  const command = `/interface/ethernet/set [find name=ether1] name=E1-WAN-FAI; ${WIFI_ENABLE_ANY_VERSION}; /tool fetch url="${scriptUrl}" http-header-field="Authorization: Bearer ${installToken}" dst-path="vpn.rsc" mode=${fetchMode}; :delay 2s; /import file-name="vpn.rsc"; :delay 1s; /ip route remove [find dst-address=10.66.0.0/24 gateway=safelinkhub-wg0]; /ip route add dst-address=10.66.0.0/24 gateway=safelinkhub-wg0; :delay 1s; /file remove "vpn.rsc"`;

  revalidatePath("/admin/settings/router-setup");
  return { success: true, routerId: router.id, command };
}

export async function deleteRouter(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);

  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Router not found." };
  }

  // If the router is still reachable over its WireGuard tunnel, strip the
  // safelinkhub-wg0 interface/peer/route from the router itself before
  // revoking the peer on the relay — otherwise the router is left with a
  // dead WireGuard config pointing at a peer slot that's about to be freed
  // and reassigned to someone else, and it just sits there retrying a
  // handshake that will never succeed. This must run BEFORE the relay-side
  // revoke below: once that peer slot is gone, the tunnel can't be reached
  // at all, so there'd be nothing left to clean up over.
  if (router.connectionMethod === "vpn" && router.status === "online") {
    try {
      const client = await connectToRouter(router, 8000);
      try {
        // RouterOS's API needs each entry's own .id to remove it — unlike
        // named objects (interfaces, bridges), peers/routes/addresses are
        // anonymous, so find-then-remove is the only way (no inline
        // [find ...] expression support over the API, only over the CLI).
        const peers = await client
          .talk(["/interface/wireguard/peers/print", "?interface=safelinkhub-wg0"])
          .catch(() => []);
        for (const peer of peers) {
          await client.talk(["/interface/wireguard/peers/remove", `=numbers=${peer[".id"]}`]).catch(() => {});
        }

        const tunnelRoutes = await client
          .talk(["/ip/route/print", "?dst-address=10.66.0.0/24", "?gateway=safelinkhub-wg0"])
          .catch(() => []);
        for (const route of tunnelRoutes) {
          await client.talk(["/ip/route/remove", `=numbers=${route[".id"]}`]).catch(() => {});
        }

        const tunnelAddresses = await client
          .talk(["/ip/address/print", "?interface=safelinkhub-wg0"])
          .catch(() => []);
        for (const address of tunnelAddresses) {
          await client.talk(["/ip/address/remove", `=numbers=${address[".id"]}`]).catch(() => {});
        }

        // Last on purpose: removing the interface itself is what actually
        // kills the tunnel our own connection is running over, so anything
        // after it would never get a response anyway.
        await client.talk(["/interface/wireguard/remove", "=numbers=safelinkhub-wg0"]).catch(() => {});
      } finally {
        client.close();
      }
    } catch {
      // Router unreachable despite status="online" (stale status, tunnel
      // already down, etc.) — nothing to clean up on-device, fall through
      // to removing the SafeLinkHub-side records regardless.
    }
  }

  // Free up the peer slot on the relay so it doesn't linger forever.
  try {
    if (router.connectionMethod === "vpn" && router.wgPeerPublicKey) {
      await revokeVpnPeer(router.wgPeerPublicKey);
    } else if (router.connectionMethod === "openvpn" && router.tunnelIp) {
      const [org] = await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, router.orgId))
        .limit(1);
      if (org) {
        await revokeOpenvpnPeer(`${org.slug}-${router.name}`);
      }
    }
  } catch {
    // Best-effort: the relay might be unreachable, but we still want the
    // router record itself removed from SafeLinkHub.
  }

  await db.delete(routers).where(eq(routers.id, routerId));

  revalidatePath("/admin/router");
  revalidatePath("/admin/settings/router-setup");
  revalidatePath("/admin/remote-access");
  return { success: true };
}

/**
 * "Réinitialiser le processus" used to just delete SafeLinkHub's own DB
 * row (same as "Supprimer le routeur") — the live RouterOS device kept
 * every interface/bridge/peer SafeLinkHub had configured, so re-running
 * the wizard against the same physical router started from a half-
 * configured state instead of a clean one, and WinBox still showed the
 * old WireGuard tunnel/peer indefinitely. This sends an actual factory
 * reset (/system/reset-configuration, no-defaults — wipes everything,
 * not just back to RouterOS's stock defaults) to the live device first,
 * best-effort, then does the same SafeLinkHub-side cleanup deleteRouter
 * does. The reset command reboots the router immediately and never
 * returns a normal reply, so a thrown/timed-out call here is treated as
 * "command was sent", not a failure — the device's own factory-reset is
 * what's authoritative on whether it actually cleared.
 */
export async function resetRouterDevice(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);

  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Router not found." };
  }

  let deviceReset = false;
  try {
    const client = await connectToRouter(router, 8000);
    try {
      // Matches the exact CLI form confirmed working directly on-device —
      // skip-backup=yes used to be sent too, and its error (if RouterOS
      // rejected it) was being silently swallowed by a blanket .catch,
      // which then unconditionally reported deviceReset=true regardless
      // of whether the command actually ran. The reset itself reboots the
      // router immediately with no normal reply, so the connection
      // dropping/timing out here IS the expected success signal — but a
      // real rejection (bad parameter, permission denied) must still
      // surface instead of being masked the same way.
      await client.talk(["/system/reset-configuration", "=no-defaults=yes"]);
      deviceReset = true;
    } catch (err) {
      // RouterOS reboots almost immediately on a valid reset-configuration
      // call, so the connection dropping/timing out IS the expected
      // success signal here, not a failure — but a genuine rejection
      // (bad parameter, permission denied) replies with a normal !trap
      // first and never reboots, and that one must still be surfaced.
      // client.ts's talk() turns a !trap into an Error carrying RouterOS's
      // own =message= text — those don't look like network/socket
      // failures, which is what distinguishes the two cases here.
      const msg = err instanceof Error ? err.message : "";
      const looksLikeConnectionDrop = /econnreset|closed|timeout|not connected|length prefix|EOF/i.test(
        msg,
      );
      deviceReset = looksLikeConnectionDrop || msg === "";
    } finally {
      client.close();
    }
  } catch {
    // Router unreachable — nothing to reset on-device, fall through to
    // removing the SafeLinkHub-side records regardless.
  }

  try {
    if (router.connectionMethod === "vpn" && router.wgPeerPublicKey) {
      await revokeVpnPeer(router.wgPeerPublicKey);
    } else if (router.connectionMethod === "openvpn" && router.tunnelIp) {
      const [org] = await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, router.orgId))
        .limit(1);
      if (org) {
        await revokeOpenvpnPeer(`${org.slug}-${router.name}`);
      }
    }
  } catch {
    // Best-effort: the relay might be unreachable, but we still want the
    // router record itself removed from SafeLinkHub.
  }

  await db.delete(routers).where(eq(routers.id, routerId));

  revalidatePath("/admin/router");
  revalidatePath("/admin/settings/router-setup");
  revalidatePath("/admin/remote-access");
  return {
    success: true,
    deviceReset,
    message: deviceReset
      ? "Commande de réinitialisation envoyée au routeur — il redémarre à l'état d'usine. Reconnectez-vous-y directement (WinBox/MAC) pour le relier à nouveau."
      : "Routeur inaccessible — seule la configuration SafeLinkHub a été supprimée. Réinitialisez l'appareil manuellement (bouton reset) avant de le relier à nouveau.",
  };
}

export async function generateOpenvpnInstallScript(
  _prevState: unknown,
  formData: FormData,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  // Créer un tunnel d'accès distant est GRATUIT (plus d'approbation superadmin) :
  // la facturation VPN est portée par les services activés (par onglet × durée).

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Router name is required." };

  const db = getDb();
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found." };

  // The OpenVPN credentials themselves are allocated lazily when the router
  // actually fetches the script (see the install-openvpn route handler) so
  // that they never need to be persisted server-side.
  const apiPassword = randomBytes(18).toString("base64url");
  const installToken = randomUUID();

  const [router] = await db
    .insert(routers)
    .values({
      orgId: session.orgId,
      name,
      apiPort: 8728,
      username: API_USERNAME,
      passwordEncrypted: encryptSecret(apiPassword),
      status: "pending",
      connectionMethod: "openvpn",
      installTokenHash: hashToken(installToken),
      installTokenExpiresAt: new Date(Date.now() + INSTALL_TOKEN_TTL_MS),
      relayShard: await nextRelayShard(db),
    })
    .returning();

  const appUrl = getAppUrl();

  const scriptUrl = `${appUrl}/api/router/v1/${org.slug}/scripts/install-openvpn`;
  const fetchMode = scriptUrl.startsWith("https://") ? "https" : "http";
  const command = `/tool fetch url="${scriptUrl}" http-header-field="Authorization: Bearer ${installToken}" dst-path="ovpn.rsc" mode=${fetchMode}; :delay 2s; /import file-name="ovpn.rsc"; :delay 1s; /file remove "ovpn.rsc"`;

  revalidatePath("/admin/settings/router-setup");
  revalidatePath("/admin/remote-access");
  return { success: true, routerId: router.id, command };
}

export async function checkRouterConnection(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);

  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Router not found." };
  }
  if (router.status === "online") {
    revalidatePath("/admin/router");
    revalidatePath("/admin/settings/router-setup");
    return { connected: true };
  }
  if (!router.host || !router.username || !router.passwordEncrypted) {
    return { connected: false };
  }

  const result = await syncRouterStats(routerId, {
    timeoutMs: 15000,
    markOfflineOnFailure: false,
  });
  if (!result.success) return { connected: false };

  revalidatePath("/admin/router");
  revalidatePath("/admin/settings/router-setup");
  return { connected: true };
}
