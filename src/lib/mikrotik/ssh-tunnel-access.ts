import type { RouterOSClient } from "./client";
import {
  getSshTunnelFirewallCommands,
  MIKHMON_TUNNEL_INTERFACES,
  tunnelInterfacesFromAddresses,
} from "./port-forward-rules";

type Sentence = Record<string, string>;

export function withSshSftpPolicy(policy: string) {
  const parts = policy
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !["ssh", "ftp", "!ssh", "!ftp"].includes(part));
  const firstDenyIndex = parts.findIndex((part) => part.startsWith("!"));
  if (firstDenyIndex === -1) {
    parts.push("ssh", "ftp");
  } else {
    parts.splice(firstDenyIndex, 0, "ssh", "ftp");
  }
  return parts.join(",");
}

async function ensureSshUserPolicy(client: RouterOSClient, username?: string, log?: string[]) {
  if (!username) return;
  const [user] = await client.talk(["/user/print", `?name=${username}`]).catch(() => [] as Sentence[]);
  const groupName = user?.group;
  if (!groupName) return;

  const [group] = await client.talk(["/user/group/print", `?name=${groupName}`]).catch(() => [] as Sentence[]);
  if (!group?.[".id"] || !group.policy) return;

  const nextPolicy = withSshSftpPolicy(group.policy);
  if (nextPolicy === group.policy) return;
  try {
    await client.talk(["/user/group/set", `=numbers=${group[".id"]}`, `=policy=${nextPolicy}`]);
    log?.push(`OK: enabled SSH/SFTP policy on user group ${groupName}`);
  } catch (err) {
    log?.push(`SKIP: could not update SSH/SFTP policy on user group ${groupName}: ${err instanceof Error ? err.message : "error"}`);
  }
}

async function ensureSshTunnelFirewall(client: RouterOSClient, log?: string[]) {
  const inputRules = await client
    .talk(["/ip/firewall/filter/print", "?chain=input"])
    .catch(() => [] as Sentence[]);
  const placeBefore = inputRules.find((rule) => rule[".id"])?.[".id"];

  // Même règle que pour MikHmon : on retrouve l'interface tunnel d'après
  // l'adresse qu'elle porte, pas d'après son nom. Un client OpenVPN RouterOS
  // s'appelle « ovpn-out1 » par défaut et n'était donc jamais reconnu.
  const addresses = await client.talk(["/ip/address/print"]).catch(() => [] as Sentence[]);
  const candidates = [
    ...new Set([...tunnelInterfacesFromAddresses(addresses), ...MIKHMON_TUNNEL_INTERFACES]),
  ];

  for (const tunnelInterface of candidates) {
    const interfaces = await client
      .talk(["/interface/print", `?name=${tunnelInterface}`])
      .catch(() => [] as Sentence[]);
    if (interfaces.length === 0) {
      log?.push(`SKIP: ${tunnelInterface} interface not present for SSH/SFTP tunnel access`);
      continue;
    }

    const commands = getSshTunnelFirewallCommands(tunnelInterface, placeBefore);
    const existing = await client.talk(commands.findExisting).catch(() => [] as Sentence[]);
    if (existing.length > 0) continue;
    await client.talk(commands.add);
    log?.push(`OK: allowed SSH/SFTP via ${tunnelInterface}`);
  }
}

export async function ensureSshTunnelAccess(client: RouterOSClient, log?: string[], username?: string) {
  await client.talk(["/ip/service/set", "=numbers=ssh", "=disabled=no"]);
  await ensureSshUserPolicy(client, username, log);
  await ensureSshTunnelFirewall(client, log);
}
