import type { RouterOSClient } from "./client";
import {
  getDockerBridgeCleanupCommands,
  getMikhmonContainerDiscoveryCommands,
  getMikhmonTunnelFirewallCommands,
  getMikhmonTunnelNatCommands,
  looksLikeMikhmonContainer,
  MIKHMON_DEFAULT_CONTAINER_IP,
  MIKHMON_TUNNEL_INTERFACES,
  tunnelInterfacesFromAddresses,
} from "./port-forward-rules";

type Sentence = Record<string, string>;

// `DOCKERS` est le bridge isolé canonique de SafeLinkHub. RouterOS conserve la
// casse : les autres orthographes sont historiques et peuvent être nettoyées si
// elles sont vides, mais `DOCKERS` ne doit jamais être supprimé par ce réparateur.
export const MIKHMON_DOCKER_BRIDGE_NAME = "DOCKERS";
export const LEGACY_DOCKER_BRIDGE_NAMES = ["CONTAINERS", "dockers", "DOCKER-SAFELINKHUB", "DOCKER"];

function isSafeLinkHubMikhmonContainer(row: Sentence) {
  return /mikhmon-sf|safelinkhub/i.test(
    [row.name, row.tag, row["root-dir"], row.comment].filter(Boolean).join(" "),
  );
}

/**
 * La veth MikHmon ne doit pas partager le bridge du hotspot. Sur ce bridge,
 * certaines politiques Hotspot/bridge laissent le processus PHP démarré mais
 * empêchent la réponse du conteneur vers le tunnel. On ne déplace que le
 * conteneur géré par SafeLinkHub ; un MikHmon installé manuellement reste
 * strictement sur son propre réseau.
 */
async function ensureManagedMikhmonDedicatedBridge(client: RouterOSClient, log?: string[]) {
  const containers = await client.talk(["/container/print"]).catch(() => [] as Sentence[]);
  const container = containers.find(
    (row) => isSafeLinkHubMikhmonContainer(row) && String(row.interface ?? "").trim(),
  );
  if (!container) return;

  const vethName = String(container.interface ?? "").trim();
  const ports = await client
    .talk(["/interface/bridge/port/print", "?interface=" + vethName])
    .catch(() => [] as Sentence[]);
  const currentPort = ports.find((row) => row.bridge);
  const currentBridge = String(currentPort?.bridge ?? "").trim();
  if (currentBridge === MIKHMON_DOCKER_BRIDGE_NAME) return;

  const targetRows = await client
    .talk(["/interface/bridge/print", "?name=" + MIKHMON_DOCKER_BRIDGE_NAME])
    .catch(() => [] as Sentence[]);
  if (targetRows.length === 0) {
    await client.talk(["/interface/bridge/add", "=name=" + MIKHMON_DOCKER_BRIDGE_NAME]);
    log?.push("OK: recreated isolated DOCKERS bridge for MikHmon");
  } else {
    const targetPorts = await client
      .talk(["/interface/bridge/port/print", "?bridge=" + MIKHMON_DOCKER_BRIDGE_NAME])
      .catch(() => [] as Sentence[]);
    // A bridge used by another service is not SafeLinkHub's to reconfigure.
    if (targetPorts.some((row) => String(row.interface ?? "") !== vethName)) {
      log?.push("WARN: DOCKERS bridge is used by another interface; MikHmon veth was left unchanged");
      return;
    }
  }

  if (currentPort?.[".id"]) {
    await client.talk(["/interface/bridge/port/remove", "=numbers=" + currentPort[".id"]]);
  }
  await client.talk([
    "/interface/bridge/port/add",
    "=bridge=" + MIKHMON_DOCKER_BRIDGE_NAME,
    "=interface=" + vethName,
  ]);

  // Laisser 11.11.11.1 sur les deux bridges crée une route ECMP : le retour
  // du conteneur devient aléatoire. La passerelle sera réinstallée ensuite sur
  // DOCKERS par ensureExistingMikhmonGateway.
  if (currentBridge) {
    const staleGateways = await client
      .talk([
        "/ip/address/print",
        "?interface=" + currentBridge,
        "?address=11.11.11.1/28",
      ])
      .catch(() => [] as Sentence[]);
    for (const gateway of staleGateways) {
      if (!gateway[".id"]) continue;
      await client.talk(["/ip/address/remove", "=numbers=" + gateway[".id"]]);
    }
  }
  log?.push("OK: moved SafeLinkHub MikHmon veth to isolated DOCKERS bridge");
}

async function cleanupLegacyDockerGateway(client: RouterOSClient, bridgeName: string, log?: string[]) {
  const commands = getDockerBridgeCleanupCommands(bridgeName);
  const bridgePorts = await client.talk(commands.findBridgePorts).catch(() => [] as Sentence[]);
  // Ce bridge peut appartenir à un MikHmon installé avant SafeLinkHub. Sa
  // passerelle 11.11.11.1 est alors nécessaire au retour vers le tunnel : la
  // retirer laisse le conteneur « running » mais le rend muet depuis le relais.
  // Seul un bridge réellement vide est une ancienne ressource à nettoyer.
  if (bridgePorts.length > 0) {
    log?.push("SKIP: preserved active legacy Docker bridge " + bridgeName);
    return;
  }

  const addresses = await client.talk(commands.findGatewayAddress).catch(() => [] as Sentence[]);
  for (const address of addresses) {
    if (!address[".id"]) continue;
    await client.talk(commands.removeGatewayAddress(address[".id"])).catch(() => {});
    log?.push(`OK: removed duplicate MikHmon gateway from ${bridgeName}`);
  }

  const bridges = await client.talk(commands.findBridge).catch(() => [] as Sentence[]);
  for (const bridge of bridges) {
    if (!bridge[".id"]) continue;
    await client.talk(commands.removeBridge(bridge[".id"])).catch(() => {});
    log?.push(`OK: removed empty legacy Docker bridge ${bridgeName}`);
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Les anciens MikHmon utilisent souvent le bridge "dockers" et une veth
 * préexistante. Tant que la passerelle déclarée par la veth n'est pas aussi
 * portée par ce bridge, le conteneur reçoit le SYN mais ne peut jamais
 * retourner sa réponse vers le tunnel OpenVPN/WireGuard.
 */
async function ensureExistingMikhmonGateway(client: RouterOSClient, log?: string[]) {
  const containers = await client.talk(["/container/print"]).catch(() => [] as Sentence[]);
  const candidates = containers.filter(looksLikeMikhmonContainer);
  const container =
    candidates.find((row) => /running/i.test(String(row.status ?? ""))) ?? candidates[0];
  if (!container) return;

  const vethName = String(container.interface ?? "").trim();
  if (!vethName) return;
  const [veth] = await client
    .talk(["/interface/veth/print", "?name=" + vethName])
    .catch(() => [] as Sentence[]);
  const gateway = String(veth?.gateway ?? "").split("/")[0].trim();
  const prefix = String(veth?.address ?? "").split("/")[1]?.trim();
  if (!IPV4.test(gateway) || !prefix) return;

  const bridgePorts = await client
    .talk(["/interface/bridge/port/print", "?interface=" + vethName])
    .catch(() => [] as Sentence[]);
  const bridgeName = String(bridgePorts.find((row) => row.bridge)?.bridge ?? "").trim();
  if (!bridgeName) return;

  const addresses = await client
    .talk(["/ip/address/print", "?interface=" + bridgeName])
    .catch(() => [] as Sentence[]);
  if (addresses.some((row) => String(row.address ?? "").split("/")[0] === gateway)) return;

  await client.talk([
    "/ip/address/add",
    "=address=" + gateway + "/" + prefix,
    "=interface=" + bridgeName,
    "=comment=SafeLinkHub MikHmon gateway",
  ]);
  log?.push("OK: restored MikHmon gateway on " + bridgeName);
}

/**
 * Adresse RÉELLE du conteneur MikHmon sur cet appareil.
 *
 * POURQUOI ON LA LIT AU LIEU DE LA SUPPOSER : le dst-nat visait 11.11.11.11 en
 * dur — l'adresse de la veth que SafeLinkHub crée lui-même. Sur un MikroTik où
 * MikHmon a été installé autrement (à la main, par un prestataire), le
 * conteneur vit sur une autre veth : la règle envoyait le trafic vers une
 * adresse où personne n'écoute, et l'accès distant expirait sans un mot.
 *
 * Prudence volontaire : on ne retient qu'un conteneur qui RESSEMBLE à MikHmon,
 * et à défaut on garde l'adresse par défaut. Il ne faut surtout pas exposer
 * publiquement un conteneur quelconque parce qu'il se trouvait être le seul.
 */
export async function resolveMikhmonContainerAddress(
  client: RouterOSClient,
  log?: string[],
): Promise<string> {
  const commands = getMikhmonContainerDiscoveryCommands("");
  const containers = await client.talk(commands.listContainers).catch(() => [] as Sentence[]);
  const candidates = containers.filter(looksLikeMikhmonContainer);
  // Un conteneur qui tourne prime sur un conteneur arrêté du même nom.
  const container =
    candidates.find((row) => /running/i.test(String(row.status ?? ""))) ?? candidates[0];
  if (!container) return MIKHMON_DEFAULT_CONTAINER_IP;

  const vethName = String(container.interface ?? "").trim();
  if (!vethName) return MIKHMON_DEFAULT_CONTAINER_IP;

  const veths = await client
    .talk(getMikhmonContainerDiscoveryCommands(vethName).findVeth)
    .catch(() => [] as Sentence[]);
  const address = String(veths[0]?.address ?? "").split("/")[0].trim();
  if (!IPV4.test(address)) return MIKHMON_DEFAULT_CONTAINER_IP;

  if (address !== MIKHMON_DEFAULT_CONTAINER_IP) {
    log?.push(`INFO: MikHmon trouvé sur ${vethName} (${address}), pas sur la veth SafeLinkHub`);
  }
  return address;
}

async function ensureMikhmonTunnelNat(client: RouterOSClient, containerIp: string, log?: string[]) {
  const commands = getMikhmonTunnelNatCommands(containerIp);
  const existing = await client.talk(commands.findExisting).catch(() => [] as Sentence[]);
  const rule = existing[0];
  if (rule?.[".id"]) {
    // Une règle qui existe mais vise la mauvaise adresse est PIRE que pas de
    // règle : elle donne l'illusion d'un accès configuré. On la redresse.
    if (String(rule["to-addresses"] ?? "") !== containerIp) {
      await client.talk(commands.retarget(rule[".id"]));
      log?.push(`OK: dst-nat MikHmon redirigé vers ${containerIp}`);
    }
    return;
  }
  await client.talk(commands.add);
  log?.push(`OK: MikHmon tunnel dst-nat port forward (${containerIp})`);
}

async function ensureMikhmonTunnelFirewall(
  client: RouterOSClient,
  containerIp: string,
  log?: string[],
) {
  const forwardRules = await client
    .talk(["/ip/firewall/filter/print", "?chain=forward"])
    .catch(() => [] as Sentence[]);
  const placeBefore = forwardRules.find((rule) => rule[".id"])?.[".id"];

  // L'interface tunnel est retrouvée D'APRÈS L'ADRESSE qu'elle porte, et non
  // d'après une liste de noms.
  //
  // POURQUOI : la liste ne contenait que « safelinkhub-wg0 » et
  // « safelinkhub-ovpn ». Or un client OpenVPN RouterOS s'appelle « ovpn-out1 »
  // par défaut — sur SHIA-HSPT, raccordé en OpenVPN (10.67.0.0/24) et non en
  // WireGuard, aucun nom ne correspondait : la règle d'acceptation n'était
  // jamais posée et le trafic MikHmon mourait dans la chaîne forward. Le
  // symptôme trompait, car MikHmon est le SEUL service à traverser forward —
  // WebFig, WinBox et SSH terminent sur le routeur (chaîne input) et
  // répondaient parfaitement.
  const addresses = await client.talk(["/ip/address/print"]).catch(() => [] as Sentence[]);
  const discovered = tunnelInterfacesFromAddresses(addresses);
  const candidates = [...new Set([...discovered, ...MIKHMON_TUNNEL_INTERFACES])];

  for (const tunnelInterface of candidates) {
    const interfaces = await client
      .talk(["/interface/print", `?name=${tunnelInterface}`])
      .catch(() => [] as Sentence[]);
    if (interfaces.length === 0) {
      log?.push(`SKIP: ${tunnelInterface} interface not present for MikHmon tunnel access`);
      continue;
    }

    const commands = getMikhmonTunnelFirewallCommands(tunnelInterface, placeBefore, containerIp);
    const existing = await client.talk(commands.findExisting).catch(() => [] as Sentence[]);
    const rule = existing[0];
    if (rule?.[".id"]) {
      if (String(rule["dst-address"] ?? "") !== containerIp) {
        await client.talk(commands.retarget(rule[".id"])).catch(() => {});
        log?.push(`OK: filtre MikHmon (${tunnelInterface}) redirigé vers ${containerIp}`);
      }
      continue;
    }
    await client.talk(commands.add);
    log?.push(`OK: allowed MikHmon via ${tunnelInterface}`);
  }
}

export async function ensureMikhmonTunnelAccess(client: RouterOSClient, log?: string[]) {
  await ensureManagedMikhmonDedicatedBridge(client, log);
  for (const bridgeName of LEGACY_DOCKER_BRIDGE_NAMES) {
    await cleanupLegacyDockerGateway(client, bridgeName, log);
  }
  await ensureExistingMikhmonGateway(client, log);
  const containerIp = await resolveMikhmonContainerAddress(client, log);
  await ensureMikhmonTunnelNat(client, containerIp, log);
  await ensureMikhmonTunnelFirewall(client, containerIp, log);
}
