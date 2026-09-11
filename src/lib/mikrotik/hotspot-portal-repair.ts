/**
 * RÉPARATION « le portail n'apparaît pas » — relancer le serveur hotspot.
 *
 * Séparé du diagnostic à dessein : hotspot-connectivity-diagnosis.ts n'écrit
 * RIEN, et un test-garde y veille. Ici vit la seule écriture, et elle est
 * délibérément grossière : un disable/enable de trois secondes.
 */
import type { RouterOSClient } from "./client";
export type PortalRepair = {
  serverName: string;
  /** L'entrée DNS « dns-name → hotspot-address » manquait et a été posée. */
  dnsEntryAdded: string | null;
  activeBefore: number;
  activeAfter: number;
  proxyStatus: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Le proxy DNS interne du hotspot meurt parfois en silence (FOUANGA,
 * 11/09/2026) ; relancer le serveur le ressuscite, avec ses règles NAT
 * dynamiques et son entrée DNS. C'est la SEULE écriture de ce module, et elle
 * est délibérément grossière : un disable/enable de trois secondes. Les
 * sessions tombent et reviennent seules par cookie — et un routeur dans cet
 * état ne servait de toute façon plus personne.
 *
 * On pose aussi l'entrée DNS statique du nom de la page de connexion si elle
 * manque : RouterOS la crée dynamiquement au démarrage du serveur, mais elle
 * s'était perdue sur FOUANGA, et sans elle la redirection n'aboutit nulle part.
 */
export async function repairHotspotPortal(
  client: RouterOSClient,
  timeoutMs = 20000,
): Promise<PortalRepair> {
  const servers = await client.talk(["/ip/hotspot/print"], timeoutMs);
  const server = servers[0];
  if (!server?.name) throw new Error("Aucun serveur hotspot sur ce routeur.");
  const serverName = server.name;

  const profiles = await client.talk(["/ip/hotspot/profile/print"], timeoutMs);
  const profile = profiles.find((p) => p.name === server.profile);
  const dnsName = profile?.["dns-name"]?.trim() ?? "";
  const hotspotAddress = profile?.["hotspot-address"]?.trim() ?? "";

  let dnsEntryAdded: string | null = null;
  if (dnsName && hotspotAddress && hotspotAddress !== "0.0.0.0") {
    const existing = await client.talk(["/ip/dns/static/print", `?name=${dnsName}`], timeoutMs);
    if (existing.length === 0) {
      await client.talk(
        [
          "/ip/dns/static/add",
          `=name=${dnsName}`,
          `=address=${hotspotAddress}`,
          "=ttl=5m",
          "=comment=safelinkhub-portal dns-name",
        ],
        timeoutMs,
      );
      dnsEntryAdded = `${dnsName} → ${hotspotAddress}`;
    }
  }

  const activeBefore = (await client.talk(["/ip/hotspot/active/print"], timeoutMs)).length;

  await client.talk(["/ip/hotspot/disable", `=numbers=${serverName}`], timeoutMs);
  await wait(3000);
  await client.talk(["/ip/hotspot/enable", `=numbers=${serverName}`], timeoutMs);
  await wait(3000);

  const [after] = await client.talk(["/ip/hotspot/print", `?name=${serverName}`], timeoutMs);
  const activeAfter = (await client.talk(["/ip/hotspot/active/print"], timeoutMs)).length;

  return {
    serverName,
    dnsEntryAdded,
    activeBefore,
    activeAfter,
    proxyStatus: after?.["proxy-status"] ?? "?",
  };
}
