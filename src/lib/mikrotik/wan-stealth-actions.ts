"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import { detectUplinkInterfaces } from "./router-lock";
import type { RouterOSClient } from "./client";
import {
  buildWanRestorePlan,
  buildWanStealthPlan,
  inspectWanStealth,
  nomFaiValide,
  type StealthStep,
  type WanLink,
  type WanStealthInput,
} from "./wan-stealth";

/**
 * Lecture et pose de la discrétion côté FAI (voir wan-stealth.ts pour ce qui
 * est possible… et pour ce qui ne l'est pas).
 */

async function autorise(routerId: string) {
  const session = await getSession();
  if (!session) return null;
  const [router] = await getDb().select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) return null;
  return router;
}

/** `raw-value` d'une option DHCP (hex) → texte, pour montrer le nom réellement envoyé. */
function hexVersTexte(raw: string | undefined): string | null {
  if (!raw || !/^[0-9a-fA-F]+$/.test(raw) || raw.length % 2 !== 0) return null;
  return Buffer.from(raw, "hex").toString("utf8") || null;
}

type Etat = WanStealthInput & { existingOptions: { name: string; id: string }[] };

/**
 * Tout ce que le routeur dit de lui-même côté WAN, en une passe de lectures.
 * Les liens WAN sont repérés par la liste d'interfaces « WAN » quand elle
 * existe, sinon par l'uplink réel (client DHCP lié / route par défaut) — jamais
 * par le NOM de l'interface, qui est renommé sur une partie du parc.
 */
async function lireEtat(client: RouterOSClient, timeoutMs = 15000): Promise<Etat> {
  const membres = await client
    .talk(["/interface/list/member/print", "=.proplist=interface,list"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const listes = await client
    .talk(["/interface/list/print", "=.proplist=name"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const parListe = membres.filter((m) => m.list === "WAN").map((m) => m.interface!).filter(Boolean);
  const noms = parListe.length > 0 ? parListe : await detectUplinkInterfaces(client, timeoutMs);

  const eth = await client
    .talk(
      ["/interface/ethernet/print", "=.proplist=.id,name,mac-address,orig-mac-address"],
      timeoutMs,
    )
    .catch(() => [] as Record<string, string>[]);
  const dhcp = await client
    .talk(["/ip/dhcp-client/print", "=.proplist=.id,interface,dhcp-options"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const options = await client
    .talk(["/ip/dhcp-client/option/print", "=.proplist=.id,name,code,raw-value"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const decouverte =
    (await client.talk(["/ip/neighbor/discovery-settings/print"], timeoutMs).catch(() => []))[0] ??
    {};
  const cloud = (await client.talk(["/ip/cloud/print"], timeoutMs).catch(() => []))[0] ?? {};
  const services = await client
    .talk(["/ip/service/print", "=.proplist=name,address,disabled"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);

  /**
   * Ce qui part VRAIMENT dans l'option 12 pour un lien : la première option
   * déclarée de code 12 parmi celles que son client DHCP envoie. On décode son
   * `raw-value` plutôt que de le supposer — c'est le seul moyen de montrer à
   * l'exploitant la chaîne exacte que reçoit le fournisseur.
   */
  const nomEnvoyePar = (dhcpOptions: string | undefined) => {
    const noms = (dhcpOptions ?? "hostname,clientid").split(",").map((n) => n.trim());
    for (const nom of noms) {
      const o = options.find((row) => row.name === nom && row.code === "12");
      if (o) return hexVersTexte(o["raw-value"]);
    }
    return null;
  };

  const links: WanLink[] = [];
  for (const name of noms) {
    const e = eth.find((row) => row.name === name);
    if (!e?.[".id"]) continue; // lien non ethernet (LTE, PPPoE) : pas de MAC à masquer.
    const d = dhcp.find((row) => row.interface === name);
    links.push({
      name,
      ethId: e[".id"],
      mac: e["mac-address"] ?? "",
      origMac: e["orig-mac-address"] ?? "",
      dhcpId: d?.[".id"],
      dhcpOptions: d?.["dhcp-options"],
      sentHostname: nomEnvoyePar(d?.["dhcp-options"]),
    });
  }

  return {
    links,
    discoverList: decouverte["discover-interface-list"] ?? "",
    discoverProtocols: decouverte.protocol ?? "",
    cloudDdns: cloud["ddns-enabled"] === "true",
    interfaceLists: listes.map((l) => l.name!).filter(Boolean),
    // Un service d'administration à l'écoute sans `address=` répond sur toutes
    // les interfaces, WAN comprise. Les services dynamiques (hotspot, resolver)
    // n'ont pas de ligne éditable : ils n'apparaissent pas ici.
    openServices: services
      .filter(
        (s) =>
          s.disabled !== "true" &&
          !s.address &&
          ["ssh", "winbox", "www", "www-ssl", "ftp", "api", "api-ssl", "telnet"].includes(
            s.name ?? "",
          ),
      )
      .map((s) => s.name!),
    existingOptions: options
      .filter((o) => o.name?.startsWith("slh-"))
      .map((o) => ({ name: o.name!, id: o[".id"]! })),
  };
}

export async function readWanStealth(routerId: string) {
  const router = await autorise(routerId);
  if (!router) return { error: "Routeur introuvable." };

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 12000);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}. Il doit être en ligne pour lire ce qu'il annonce.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const etat = await lireEtat(client);
    return {
      success: true as const,
      leaks: inspectWanStealth(etat),
      links: etat.links.map((l) => ({
        name: l.name,
        mac: l.mac,
        usine: Boolean(l.origMac) && l.mac.toUpperCase() === l.origMac.toUpperCase(),
        /** La chaîne exacte reçue par le fournisseur, décodée du routeur. */
        nomEnvoye: l.sentHostname ?? "aucun",
        identiteSysteme: l.dhcpOptions?.split(",").includes("hostname") !== false,
      })),
    };
  } finally {
    client.close();
  }
}

/**
 * Exécute un plan, en tolérant la perte de réponse : changer la MAC d'un lien
 * WAN renégocie son bail DHCP et coupe le tunnel quelques secondes — la
 * commande PART bien, mais son accusé peut ne jamais revenir. On l'annonce
 * comme posée plutôt que de faire croire à un échec.
 */
async function executer(client: RouterOSClient, steps: StealthStep[]) {
  const faits: string[] = [];
  const echecs: string[] = [];
  for (const step of steps) {
    try {
      await client.talk(step.words, 20000);
      faits.push(step.label);
    } catch (err) {
      const message = err instanceof Error ? err.message : "erreur";
      const coupure = /timed out|out of sync|closed|terminated/i.test(message);
      if (coupure) {
        faits.push(`${step.label} (lien renégocié — accusé perdu)`);
        break; // la connexion est morte : la suite échouerait en cascade.
      }
      echecs.push(`${step.label} : ${message}`);
    }
  }
  return { faits, echecs };
}

export async function applyWanStealth(
  routerId: string,
  opts: { label: string; spoofMac: boolean },
) {
  const router = await autorise(routerId);
  if (!router) return { error: "Routeur introuvable." };
  const label = opts.label.trim();
  if (label && !nomFaiValide(label)) {
    return {
      error:
        "Nom refusé : lettres, chiffres et tirets uniquement (32 caractères max), comme un nom d'hôte.",
    };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 15000);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur injoignable : ${err.message}.`
          : "Routeur injoignable (doit être en ligne).",
    };
  }
  try {
    const etat = await lireEtat(client);
    if (etat.links.length === 0) {
      return { error: "Aucun lien WAN identifié sur ce routeur — rien à masquer." };
    }
    const steps = buildWanStealthPlan(etat, {
      label,
      spoofMac: opts.spoofMac,
      seed: routerId,
      existingOptions: etat.existingOptions,
    });
    if (steps.length === 0) {
      return { success: true as const, faits: [], echecs: [], summary: "Rien à changer : ce routeur est déjà discret côté FAI." };
    }
    const { faits, echecs } = await executer(client, steps);
    return {
      success: true as const,
      faits,
      echecs,
      summary:
        echecs.length > 0
          ? `${faits.length} réglage(s) posé(s), ${echecs.length} en échec.`
          : `${faits.length} réglage(s) posé(s).`,
    };
  } finally {
    client.close();
  }
}

/** Rétablit l'identité d'usine (MAC et nom d'hôte système). */
export async function restoreWanIdentity(routerId: string) {
  const router = await autorise(routerId);
  if (!router) return { error: "Routeur introuvable." };

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router, 15000);
  } catch (err) {
    return {
      error: err instanceof Error ? `Routeur injoignable : ${err.message}.` : "Routeur injoignable.",
    };
  }
  try {
    const etat = await lireEtat(client);
    const steps = buildWanRestorePlan(etat);
    if (steps.length === 0) {
      return { success: true as const, faits: [], echecs: [], summary: "Le routeur est déjà sur son identité d'usine." };
    }
    const { faits, echecs } = await executer(client, steps);
    return { success: true as const, faits, echecs, summary: `${faits.length} réglage(s) rétabli(s).` };
  } finally {
    client.close();
  }
}
