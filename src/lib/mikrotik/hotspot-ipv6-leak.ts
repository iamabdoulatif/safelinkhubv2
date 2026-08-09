// Fuite du portail captif en IPv6 — module « plain », sans "use server".
//
// LE PROBLÈME : le hotspot MikroTik n'intercepte que l'IPv4. Si les clients du
// bridge hotspot reçoivent en plus de l'IPv6 (annonces de routeur venues de la
// box du FAI, ou du MikroTik lui-même), ils atteignent Internet en IPv6 SANS
// jamais passer par le portail — donc sans payer. Le ticket n'est pas
// contourné par malice : le téléphone préfère l'IPv6 tout seul.
//
// Ce module DÉTECTE la situation et sait la fermer, de façon réversible.

import type { RouterOSClient } from "./client";
import { HOTSPOT_BRIDGE_NAME } from "./constants";

/** Marque nos règles pour les retrouver et les retirer sans toucher au reste. */
export const HOTSPOT_IPV6_COMMENT = "SafeLinkHub: pas d'IPv6 pour le portail captif";

export type HotspotIpv6Inspection = {
  /** Le paquet ipv6 est-il actif ? (menu absent = rien à faire) */
  ipv6Enabled: boolean;
  /** Le routeur a-t-il une IPv6 GLOBALE, donc un chemin vers Internet ? */
  hasGlobalIpv6: boolean;
  /** Bridges hotspot trouvés sur ce routeur. */
  bridges: string[];
  /** Bridges qui reçoivent des annonces de routeur (ND) actives. */
  advertisingBridges: string[];
  /**
   * PREUVE FACTUELLE : nombre de voisins du bridge hotspot détenant réellement
   * une IPv6 globale. Ne déduit rien — constate.
   */
  clientsWithIpv6: number;
  /**
   * La source est-elle EN AMONT du MikroTik (box du FAI pontée sur le même
   * segment) plutôt que le routeur lui-même ? Change ce qu'il faut poser.
   */
  upstreamSource: boolean;
  /** Notre blocage est-il déjà en place ? */
  alreadyBlocked: boolean;
  /** Verdict : des clients hotspot peuvent-ils sortir en IPv6 sans payer ? */
  leaking: boolean;
  verdict: string;
};

/** Bridges hotspot présents, en tolérant l'ancien nom « HOTSPOT ». */
export async function findHotspotBridges(
  client: RouterOSClient,
  preferredBridgeName: string | null,
  timeoutMs = 15000,
): Promise<string[]> {
  const candidates = Array.from(new Set([preferredBridgeName || HOTSPOT_BRIDGE_NAME, "HOTSPOT"]));
  const found: string[] = [];
  for (const name of candidates) {
    const rows = await client
      .talk(["/interface/bridge/print", `?name=${name}`], timeoutMs)
      .catch(() => [] as Record<string, string>[]);
    if (rows.length > 0) found.push(name);
  }
  return found;
}

/**
 * Diagnostic LECTURE SEULE. N'écrit rien sur le routeur.
 *
 * Une fuite suppose trois choses à la fois : le paquet IPv6 actif, une IPv6
 * globale (sinon le routeur n'a nulle part où router), et des annonces de
 * routeur vivantes sur un bridge hotspot. Il en manque une, il n'y a pas de
 * fuite — et on ne va rien changer.
 */
export async function inspectHotspotIpv6(
  client: RouterOSClient,
  preferredBridgeName: string | null,
  timeoutMs = 15000,
): Promise<HotspotIpv6Inspection> {
  const bridges = await findHotspotBridges(client, preferredBridgeName, timeoutMs);

  // Le menu /ipv6 n'existe pas quand le paquet est désactivé : l'appel échoue,
  // et c'est une réponse en soi.
  let addresses: Record<string, string>[] | null = null;
  try {
    addresses = await client.talk(["/ipv6/address/print"], timeoutMs);
  } catch {
    addresses = null;
  }
  if (addresses === null) {
    return {
      ipv6Enabled: false,
      hasGlobalIpv6: false,
      bridges,
      advertisingBridges: [],
      clientsWithIpv6: 0,
      upstreamSource: false,
      alreadyBlocked: false,
      leaking: false,
      verdict: "Le paquet IPv6 est désactivé sur ce routeur — aucune fuite possible.",
    };
  }

  const hasGlobalIpv6 = addresses.some((row) => {
    const address = (row.address ?? "").trim().toLowerCase();
    if (!address || (row.invalid ?? "") === "true") return false;
    // Lien-local et unique-local ne sortent pas sur Internet.
    return !address.startsWith("fe80:") && !address.startsWith("fc") && !address.startsWith("fd");
  });

  const nd = await client
    .talk(["/ipv6/nd/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const advertisingBridges = bridges.filter((bridge) =>
    nd.some((entry) => {
      if ((entry.disabled ?? "") === "true") return false;
      const iface = (entry.interface ?? "").trim();
      // L'entrée par défaut « all » couvre tout bridge sans entrée propre.
      return iface === bridge || iface === "all" || iface === "";
    }),
  );

  // PREUVE FACTUELLE. Demander « qui annonce ? » est une déduction, et elle a
  // un angle mort : si la box du FAI est PONTÉE sur le même segment que les
  // clients, c'est elle qui annonce, le MikroTik n'a aucune entrée ND, et la
  // déduction conclut à tort qu'il n'y a pas de fuite. La table des voisins,
  // elle, répond à la seule question qui compte : mes clients détiennent-ils
  // une IPv6 globale, quelle qu'en soit la source ?
  const neighbors = await client
    .talk(["/ipv6/neighbor/print"], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const clientsWithIpv6 = neighbors.filter((row) => {
    const iface = (row.interface ?? "").trim();
    if (!bridges.includes(iface)) return false;
    const address = (row.address ?? "").trim().toLowerCase();
    return (
      address !== "" &&
      !address.startsWith("fe80:") &&
      !address.startsWith("fc") &&
      !address.startsWith("fd")
    );
  }).length;

  const existing = await client
    .talk(["/ipv6/firewall/filter/print", `?comment=${HOTSPOT_IPV6_COMMENT}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  const alreadyBlocked = existing.length > 0;

  // Des clients porteurs d'IPv6 alors que le routeur n'annonce rien : la source
  // est ailleurs, en amont.
  const upstreamSource = clientsWithIpv6 > 0 && advertisingBridges.length === 0;

  // Constat OU déduction. La déduction reste utile : un scan de nuit, sans
  // client connecté, doit quand même repérer un routeur qui distribuera de
  // l'IPv6 dès le premier arrivant.
  const leaking =
    !alreadyBlocked &&
    (clientsWithIpv6 > 0 || (hasGlobalIpv6 && advertisingBridges.length > 0));

  let verdict: string;
  if (bridges.length === 0) {
    verdict = "Aucun bridge hotspot identifié sur ce routeur.";
  } else if (alreadyBlocked) {
    verdict = "Sortie IPv6 des clients hotspot déjà bloquée par SafeLinkHub.";
  } else if (upstreamSource) {
    verdict = `FUITE CONSTATÉE : ${clientsWithIpv6} client(s) détiennent une IPv6 globale alors que le routeur n'annonce rien — la source est en amont (box du FAI pontée sur le segment client).`;
  } else if (clientsWithIpv6 > 0) {
    verdict = `FUITE CONSTATÉE : ${clientsWithIpv6} client(s) hotspot détiennent une IPv6 globale et peuvent sortir sans passer par le portail.`;
  } else if (hasGlobalIpv6 && advertisingBridges.length > 0) {
    verdict = `FUITE À VENIR : aucun client porteur d'IPv6 pour l'instant, mais ${advertisingBridges.join(", ")} en annonce — le prochain arrivant en recevra.`;
  } else if (!hasGlobalIpv6) {
    verdict = "IPv6 active mais sans adresse globale — les clients n'ont pas de sortie IPv6.";
  } else {
    verdict = "IPv6 globale présente, mais aucune annonce sur le bridge hotspot et aucun client porteur.";
  }

  return {
    ipv6Enabled: true,
    hasGlobalIpv6,
    bridges,
    advertisingBridges,
    clientsWithIpv6,
    upstreamSource,
    alreadyBlocked,
    leaking,
    verdict,
  };
}

export type HotspotIpv6BlockResult = {
  applied: boolean;
  bridges: string[];
  /** Règles de pare-feu posées (une par bridge). */
  rulesAdded: number;
  /** Annonces de routeur coupées sur le bridge. */
  ndDisabled: number;
  /** Filtres de PONT posés (cas de la box du FAI pontée sur le segment client). */
  bridgeRulesAdded: number;
};

/**
 * Ferme la sortie IPv6 des clients hotspot, sans toucher à l'IPv6 du routeur
 * lui-même (management, tunnel, mises à jour restent intacts).
 *
 * Deux verrous complémentaires, tous deux marqués et réversibles :
 *  1. une entrée ND désactivée sur le bridge → le routeur cesse d'annoncer un
 *     préfixe aux clients, donc ils n'obtiennent plus d'IPv6 ;
 *  2. une règle `forward` qui jette le trafic IPv6 venant du bridge → filet
 *     pour les appareils ayant déjà une adresse, ou si la box du FAI annonce
 *     directement sur le même segment.
 *
 * Idempotent : on lit avant d'écrire, relancer ne double rien.
 */
export async function blockHotspotIpv6(
  client: RouterOSClient,
  preferredBridgeName: string | null,
  timeoutMs = 15000,
): Promise<HotspotIpv6BlockResult> {
  const bridges = await findHotspotBridges(client, preferredBridgeName, timeoutMs);
  if (bridges.length === 0) {
    return { applied: false, bridges: [], rulesAdded: 0, ndDisabled: 0, bridgeRulesAdded: 0 };
  }

  let rulesAdded = 0;
  let ndDisabled = 0;
  let bridgeRulesAdded = 0;

  for (const bridge of bridges) {
    // 1. Couper les annonces de routeur sur ce bridge. Une entrée SPÉCIFIQUE
    //    prime sur l'entrée « all » de RouterOS, donc les autres interfaces ne
    //    sont pas affectées.
    const ndRows = await client
      .talk(["/ipv6/nd/print", `?interface=${bridge}`], timeoutMs)
      .catch(() => [] as Record<string, string>[]);
    if (ndRows.length === 0) {
      await client
        .talk(
          ["/ipv6/nd/add", `=interface=${bridge}`, "=disabled=yes", `=comment=${HOTSPOT_IPV6_COMMENT}`],
          timeoutMs,
        )
        .then(() => {
          ndDisabled += 1;
        })
        .catch(() => {});
    } else if ((ndRows[0].disabled ?? "") !== "true" && ndRows[0][".id"]) {
      await client
        .talk(["/ipv6/nd/set", `=numbers=${ndRows[0][".id"]}`, "=disabled=yes"], timeoutMs)
        .then(() => {
          ndDisabled += 1;
        })
        .catch(() => {});
    }

    // 2. Jeter le trafic IPv6 sortant de ce bridge.
    const existing = await client
      .talk(
        ["/ipv6/firewall/filter/print", `?comment=${HOTSPOT_IPV6_COMMENT}`, `?in-interface=${bridge}`],
        timeoutMs,
      )
      .catch(() => [] as Record<string, string>[]);
    if (existing.length === 0) {
      await client
        .talk(
          [
            "/ipv6/firewall/filter/add",
            "=chain=forward",
            `=in-interface=${bridge}`,
            "=action=drop",
            `=comment=${HOTSPOT_IPV6_COMMENT}`,
          ],
          timeoutMs,
        )
        .then(() => {
          rulesAdded += 1;
        })
        .catch(() => {});
    }

    // 3. Filtre de PONT. Indispensable quand la box du FAI est pontée sur le
    //    même segment que les clients : leur trafic IPv6 va alors directement
    //    de la box au client au niveau 2, sans jamais traverser la pile IPv6
    //    du routeur — la règle `forward` ci-dessus ne le voit même pas.
    //    Scopé au bridge hotspot (`in-bridge`), donc le pont des conteneurs
    //    n'est pas concerné. Chaîne forward : le routeur lui-même n'est pas
    //    affecté.
    const existingBridgeRule = await client
      .talk(
        ["/interface/bridge/filter/print", `?comment=${HOTSPOT_IPV6_COMMENT}`, `?in-bridge=${bridge}`],
        timeoutMs,
      )
      .catch(() => [] as Record<string, string>[]);
    if (existingBridgeRule.length === 0) {
      await client
        .talk(
          [
            "/interface/bridge/filter/add",
            "=chain=forward",
            `=in-bridge=${bridge}`,
            "=mac-protocol=ipv6",
            "=action=drop",
            `=comment=${HOTSPOT_IPV6_COMMENT}`,
          ],
          timeoutMs,
        )
        .then(() => {
          bridgeRulesAdded += 1;
        })
        .catch(() => {});
    }
  }

  return {
    applied: rulesAdded > 0 || ndDisabled > 0 || bridgeRulesAdded > 0,
    bridges,
    rulesAdded,
    ndDisabled,
    bridgeRulesAdded,
  };
}

/** Annule exactement ce que blockHotspotIpv6 a posé, et rien d'autre. */
export async function unblockHotspotIpv6(
  client: RouterOSClient,
  timeoutMs = 15000,
): Promise<{ rulesRemoved: number; ndReenabled: number; bridgeRulesRemoved: number }> {
  let rulesRemoved = 0;
  let ndReenabled = 0;
  let bridgeRulesRemoved = 0;

  const rules = await client
    .talk(["/ipv6/firewall/filter/print", `?comment=${HOTSPOT_IPV6_COMMENT}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  for (const rule of rules) {
    if (!rule[".id"]) continue;
    await client
      .talk(["/ipv6/firewall/filter/remove", `=numbers=${rule[".id"]}`], timeoutMs)
      .then(() => {
        rulesRemoved += 1;
      })
      .catch(() => {});
  }

  const nd = await client
    .talk(["/ipv6/nd/print", `?comment=${HOTSPOT_IPV6_COMMENT}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  for (const entry of nd) {
    if (!entry[".id"]) continue;
    await client
      .talk(["/ipv6/nd/remove", `=numbers=${entry[".id"]}`], timeoutMs)
      .then(() => {
        ndReenabled += 1;
      })
      .catch(() => {});
  }

  const bridgeRules = await client
    .talk(["/interface/bridge/filter/print", `?comment=${HOTSPOT_IPV6_COMMENT}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  for (const rule of bridgeRules) {
    if (!rule[".id"]) continue;
    await client
      .talk(["/interface/bridge/filter/remove", `=numbers=${rule[".id"]}`], timeoutMs)
      .then(() => {
        bridgeRulesRemoved += 1;
      })
      .catch(() => {});
  }

  return { rulesRemoved, ndReenabled, bridgeRulesRemoved };
}
