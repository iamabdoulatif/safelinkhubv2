import type { RouterOSClient } from "./client";
import {
  getDockerBridgeCleanupCommands,
  getMikhmonTunnelFirewallCommands,
  getMikhmonTunnelNatCommands,
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

async function ensureMikhmonTunnelNat(client: RouterOSClient, log?: string[]) {
  const commands = getMikhmonTunnelNatCommands();
  const existing = await client.talk(commands.findExisting).catch(() => [] as Sentence[]);
  if (existing.length > 0) return;
  await client.talk(commands.add);
  log?.push("OK: MikHmon tunnel dst-nat port forward");
}

async function ensureMikhmonTunnelFirewall(client: RouterOSClient, log?: string[]) {
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

    const commands = getMikhmonTunnelFirewallCommands(tunnelInterface, placeBefore);
    const existing = await client.talk(commands.findExisting).catch(() => [] as Sentence[]);
    if (existing.length > 0) continue;
    await client.talk(commands.add);
    log?.push(`OK: allowed MikHmon via ${tunnelInterface}`);
  }
}

export async function ensureMikhmonTunnelAccess(client: RouterOSClient, log?: string[]) {
  for (const bridgeName of LEGACY_DOCKER_BRIDGE_NAMES) {
    await cleanupLegacyDockerGateway(client, bridgeName, log);
  }
  await ensureMikhmonTunnelNat(client, log);
  await ensureMikhmonTunnelFirewall(client, log);
}
