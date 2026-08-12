import type { RouterOSClient } from "./client";
import {
  getDockerBridgeCleanupCommands,
  getMikhmonContainerDiscoveryCommands,
  getMikhmonTunnelFirewallCommands,
  getMikhmonTunnelNatCommands,
  looksLikeMikhmonContainer,
  MIKHMON_DEFAULT_CONTAINER_IP,
  MIKHMON_TUNNEL_INTERFACES,
} from "./port-forward-rules";

type Sentence = Record<string, string>;

export const LEGACY_DOCKER_BRIDGE_NAMES = ["CONTAINERS", "dockers", "DOCKER-SAFELINKHUB", "DOCKER"];

async function cleanupLegacyDockerGateway(client: RouterOSClient, bridgeName: string, log?: string[]) {
  const commands = getDockerBridgeCleanupCommands(bridgeName);
  const addresses = await client.talk(commands.findGatewayAddress).catch(() => [] as Sentence[]);
  for (const address of addresses) {
    if (!address[".id"]) continue;
    await client.talk(commands.removeGatewayAddress(address[".id"])).catch(() => {});
    log?.push(`OK: removed duplicate MikHmon gateway from ${bridgeName}`);
  }

  const bridgePorts = await client.talk(commands.findBridgePorts).catch(() => [] as Sentence[]);
  if (bridgePorts.length > 0) return;

  const bridges = await client.talk(commands.findBridge).catch(() => [] as Sentence[]);
  for (const bridge of bridges) {
    if (!bridge[".id"]) continue;
    await client.talk(commands.removeBridge(bridge[".id"])).catch(() => {});
    log?.push(`OK: removed empty legacy Docker bridge ${bridgeName}`);
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

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

  for (const tunnelInterface of MIKHMON_TUNNEL_INTERFACES) {
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
  for (const bridgeName of LEGACY_DOCKER_BRIDGE_NAMES) {
    await cleanupLegacyDockerGateway(client, bridgeName, log);
  }
  const containerIp = await resolveMikhmonContainerAddress(client, log);
  await ensureMikhmonTunnelNat(client, containerIp, log);
  await ensureMikhmonTunnelFirewall(client, containerIp, log);
}
