import type { RouterOSClient } from "./client";
import {
  architectureSupportsContainers,
  deploymentScenario,
  findMikrotikModel,
  scenarioLabel,
  type Architecture,
  type DeploymentScenario,
} from "./device-catalog";
import { readWifiState, type WifiState } from "./wifi-compat";
import type { BackupSnapshot } from "./router-backup";

/**
 * Scan matériel du routeur de RECHANGE, à faire AVANT toute restauration.
 *
 * Deux MikroTik ne se remplacent jamais à l'identique : nombre de ports
 * différent, WiFi sur une autre API (voire absent), et surtout un support
 * MikHmon qui dépend de l'architecture. Ce module lit le matériel réel puis
 * construit un PLAN — ce qui sera repris, ce qui sera adapté, ce qui est
 * impossible — pour que l'admin le voie avant d'agir plutôt qu'après.
 *
 * Tout est en lecture seule : scanner ne modifie jamais le routeur.
 */
export type HardwareScan = {
  model: string | null;
  architecture: Architecture | null;
  rosVersion: string | null;
  serialNumber: string | null;
  /** Nom RouterOS actuel (/system/identity) — celui que la reprise remplacera. */
  identity: string | null;
  ethernet: { name: string; running: boolean }[];
  wifi: WifiState;
  supportsContainers: boolean;
  hasUsbStorage: boolean;
  scenario: DeploymentScenario;
  /** Un hotspot actif est requis : la restauration ne le crée pas (l'auto-setup si). */
  hasActiveHotspot: boolean;
  /** Serveurs HotSpot effectivement activés, lus sans modifier la cible. */
  hotspotServers: { name: string; addressPool: string | null }[];
};

/** Lit le matériel de la cible. Aucune écriture. */
export async function scanRouterHardware(client: RouterOSClient): Promise<HardwareScan> {
  const [resource] = await client
    .talk(["/system/resource/print"], 20000)
    .catch(() => [] as Record<string, string>[]);
  const [board] = await client
    .talk(["/system/routerboard/print"], 20000)
    .catch(() => [] as Record<string, string>[]);
  const [identityRow] = await client
    .talk(["/system/identity/print"], 20000)
    .catch(() => [] as Record<string, string>[]);
  const ethernetRows = await client
    .talk(["/interface/ethernet/print"], 20000)
    .catch(() => [] as Record<string, string>[]);
  const usbRows = await client
    .talk(["/system/resource/usb/print"], 20000)
    .catch(() => [] as Record<string, string>[]);
  const diskRows = await client
    .talk(["/disk/print"], 20000)
    .catch(() => [] as Record<string, string>[]);
  const hotspots = await client
    .talk(["/ip/hotspot/print", "=.proplist=.id,name,disabled,address-pool"], 20000)
    .catch(() => [] as Record<string, string>[]);

  const wifi = await readWifiState(client);
  const model = resource?.["board-name"] ?? null;
  const catalog = findMikrotikModel(model);
  // L'architecture est lue sur l'appareil (/system/resource) et non déduite du
  // modèle : c'est elle qui décide du support container, et une board absente
  // du catalogue doit quand même être jugée correctement.
  const architecture = (resource?.["architecture-name"]?.trim().toLowerCase() ??
    catalog?.architecture ??
    null) as Architecture | null;

  const supportsContainers = architecture ? architectureSupportsContainers(architecture) : false;

  // Double signal, comme device-detect : certains builds ne peuplent PAS
  // /system/resource/usb/print alors que la clé est bien là et visible en slot
  // "usb1" dans /disk/print. Relevé sur le parc, la commande /system/resource/
  // usb/print échoue même carrément sur les boards ax (arm/arm64). S'y fier
  // seul annoncerait « pas d'USB » — donc MikHmon en tmpfs — sur un routeur
  // parfaitement équipé.
  const usb1DiskLive = diskRows.some((d) => d.slot === "usb1");
  const hasUsbStorage = usbRows.length > 0 || usb1DiskLive;
  // Disque interne persistant : slot "disk…" non-tmpfs (le slot RAM est "tmp").
  // Signal LIVE, qui complète les drapeaux statiques du catalogue.
  const internalNonTmpfsDisk = diskRows.some(
    (d) => typeof d.slot === "string" && /^disk\d*$/i.test(d.slot) && d.type !== "tmpfs",
  );
  const hotspotServers = hotspots
    .filter((hotspot) => hotspot.disabled !== "true" && !!hotspot.name)
    .map((hotspot) => ({
      name: hotspot.name,
      addressPool:
        hotspot["address-pool"] && hotspot["address-pool"] !== "none"
          ? hotspot["address-pool"]
          : null,
    }));

  return {
    model,
    architecture,
    rosVersion: resource?.version ?? null,
    serialNumber: board?.["serial-number"] ?? null,
    identity: identityRow?.name ?? null,
    ethernet: ethernetRows
      .filter((r) => r.name)
      .map((r) => ({ name: r.name, running: r.running === "true" })),
    wifi,
    supportsContainers,
    hasUsbStorage,
    scenario: deploymentScenario({
      supportsContainers,
      hasUsbStorage,
      hasEmmcStorage: !!catalog?.hasEmmcStorage,
      hasLargeOnboardStorage: !!catalog?.hasLargeOnboardStorage || internalNonTmpfsDisk,
    }),
    hasActiveHotspot: hotspotServers.length > 0,
    hotspotServers,
  };
}

export type RestorePlan = {
  /** Le rechange reprend le nom RouterOS de l'ancien : il EST l'ancien, pour le parc. */
  identity: { from: string | null; to: string | null; willApply: boolean };
  wifi: {
    ssid: string | null;
    sourceApi: string | null;
    targetApi: WifiState["api"];
    radios: string[];
    translated: boolean;
  };
  ports: { source: number; target: number; delta: number };
  mikhmon: {
    sourceScenario: DeploymentScenario | null;
    targetScenario: DeploymentScenario;
    sourceLabel: string | null;
    targetLabel: string;
  };
  data: { tickets: number; profiles: number; walledGarden: number };
  /** Référence locale validée avant tout ticket ou profil restauré. */
  hotspot: { server: string | null; addressPool: string | null; validated: boolean };
  /**
   * Le portail captif est RÉINSTALLÉ depuis le SaaS après la restauration : ses
   * fichiers ne sont pas dans la sauvegarde (ils vivent sur la flash), donc sans
   * cette étape le rechange servirait la page RouterOS par défaut.
   */
  portal: { templateId: string | null; templateName: string | null; willReinstall: boolean };
  /** Empêche une reprise correcte — à régler avant de restaurer. */
  blockers: string[];
  /** Sera adapté automatiquement — pour information. */
  adjustments: string[];
};

/**
 * Confronte la sauvegarde au matériel scanné. Fonction PURE : aucune I/O, donc
 * chaque règle d'ajustement est testable sans routeur.
 */
export function buildRestorePlan(snapshot: BackupSnapshot, scan: HardwareScan): RestorePlan {
  const blockers: string[] = [];
  const adjustments: string[] = [];

  const sourceModel = snapshot.router.model;
  const sourceCatalog = findMikrotikModel(sourceModel);
  const sourceArch = sourceCatalog?.architecture ?? null;
  const sourceSupportsContainers = sourceArch
    ? architectureSupportsContainers(sourceArch)
    : false;
  // Le scénario de la SOURCE est reconstruit depuis son modèle : la sauvegarde
  // ne dit pas si une clé USB était branchée. On prend donc l'hypothèse la plus
  // favorable (usb=false) — assez pour comparer les GÉNÉRATIONS, ce qui est
  // l'enjeu (container possible ou non), pas pour rejouer un réglage.
  const sourceScenario = sourceModel
    ? deploymentScenario({
        supportsContainers: sourceSupportsContainers,
        hasUsbStorage: false,
        hasEmmcStorage: !!sourceCatalog?.hasEmmcStorage,
        hasLargeOnboardStorage: !!sourceCatalog?.hasLargeOnboardStorage,
      })
    : null;

  // --- Identité : le rechange prend le nom de l'ancien ---------------------
  const sourceIdentity = snapshot.router.identity ?? snapshot.router.name ?? null;
  const identity = {
    from: scan.identity,
    to: sourceIdentity,
    willApply: !!sourceIdentity && sourceIdentity !== scan.identity,
  };
  if (identity.willApply) {
    adjustments.push(
      `Nom RouterOS : « ${scan.identity ?? "?"} » devient « ${sourceIdentity} » — le rechange reprend l'identité de l'ancien.`,
    );
  }

  // --- WiFi ---------------------------------------------------------------
  const ssid = snapshot.identity?.ssid ?? null;
  const sourceApi = snapshot.identity?.wifiApi ?? null;
  const translated =
    !!sourceApi && scan.wifi.api !== "none" && sourceApi !== "none" && sourceApi !== scan.wifi.api;
  const wifi = {
    ssid,
    sourceApi,
    targetApi: scan.wifi.api,
    radios: scan.wifi.radios.map((r) => r.name),
    translated,
  };
  if (ssid && scan.wifi.api === "none") {
    // Pas un blocage : le hotspot filaire fonctionne, mais l'admin doit savoir
    // que ses clients WiFi n'ont plus de réseau auquel se raccrocher.
    adjustments.push(
      `Le rechange n'a AUCUNE radio WiFi : le SSID « ${ssid} » ne peut pas être repris. Les clients WiFi devront passer par un point d'accès séparé.`,
    );
  } else if (ssid && translated) {
    adjustments.push(
      `WiFi traduit « ${sourceApi} » → « ${scan.wifi.api} » : le SSID « ${ssid} » est réécrit dans l'API du rechange, sur ${wifi.radios.join(", ")}.`,
    );
  } else if (ssid) {
    adjustments.push(`SSID « ${ssid} » repris sur ${wifi.radios.join(", ") || "aucune radio"}.`);
  }

  // --- Ports --------------------------------------------------------------
  // Comparé pour information seulement : l'auto-setup met TOUS les ports non-WAN
  // dans le bridge, quel que soit leur nombre. Un rechange avec moins de ports
  // fonctionne donc, mais l'admin doit savoir qu'il aura moins de prises.
  // Les sauvegardes d'avant l'ajout de la section "ethernet" n'ont pas ce
  // compte : on affiche alors 0 et on se tait, plutôt que d'inventer un écart.
  const sourcePorts = (snapshot.sections.ethernet ?? []).length;
  const targetPorts = scan.ethernet.length;
  const ports = { source: sourcePorts, target: targetPorts, delta: targetPorts - sourcePorts };
  if (sourcePorts > 0 && targetPorts < sourcePorts) {
    adjustments.push(
      `Le rechange a ${targetPorts} port(s) Ethernet contre ${sourcePorts} sur l'ancien : les câbles en surnombre n'auront pas de prise.`,
    );
  }

  // --- MikHmon ------------------------------------------------------------
  const mikhmon = {
    sourceScenario,
    targetScenario: scan.scenario,
    sourceLabel: sourceScenario ? scenarioLabel(sourceScenario) : null,
    targetLabel: scenarioLabel(scan.scenario),
  };
  if (sourceSupportsContainers && !scan.supportsContainers) {
    // Le cas qui fait vraiment mal : hAP ax (ARM) → RB951 (mipsbe). Les tickets
    // se restaurent, mais l'interface de gestion MikHmon ne tournera jamais.
    blockers.push(
      `L'ancien faisait tourner MikHmon en container (${mikhmon.sourceLabel}), mais le rechange est en ${scan.architecture ?? "?"} — RouterOS n'y supporte PAS les containers. Les tickets seront restaurés, mais MikHmon ne pourra pas y tourner.`,
    );
  } else if (!sourceSupportsContainers && scan.supportsContainers) {
    adjustments.push(
      `Le rechange supporte les containers (${mikhmon.targetLabel}) alors que l'ancien ne le pouvait pas : MikHmon pourra y tourner après l'auto-setup.`,
    );
  } else if (sourceScenario && sourceScenario !== scan.scenario) {
    adjustments.push(
      `Support MikHmon différent : ${mikhmon.sourceLabel} → ${mikhmon.targetLabel}. L'auto-setup choisit le bon support pour ce matériel.`,
    );
  }
  if (scan.scenario === 2) {
    adjustments.push(
      "Aucune clé USB détectée : MikHmon sera extrait en tmpfs (RAM) et devra être réinstallé après un redémarrage. Branchez une clé USB pour l'éviter.",
    );
  }

  // --- Portail captif -----------------------------------------------------
  // Les fichiers du portail ne sont PAS dans la sauvegarde (ils vivent sur la
  // flash du routeur). Sans réinstallation, le rechange servirait la page de
  // connexion RouterOS par défaut : pas de forfaits, pas de paiement.
  const portal = {
    templateId: snapshot.portal?.templateId ?? null,
    templateName: snapshot.portal?.templateName ?? null,
    willReinstall: !!snapshot.portal?.templateId,
  };
  if (portal.willReinstall) {
    adjustments.push(
      `Portail captif « ${portal.templateName} » réinstallé après la restauration — ses fichiers ne sont pas dans la sauvegarde, ils sont repoussés depuis le SaaS.`,
    );
  } else {
    adjustments.push(
      "Aucun modèle de portail mémorisé pour l'ancien : après la restauration, installez le portail depuis Réglages → Portails captifs, sinon le rechange affichera la page de connexion RouterOS par défaut.",
    );
  }

  // --- Pré-requis ---------------------------------------------------------
  if (!scan.hasActiveHotspot) {
    blockers.push(
      "Aucun hotspot sur le rechange : les tickets n'ont nulle part où aller. Lancez l'auto-setup sur ce routeur AVANT de restaurer.",
    );
  }
  const hasHotspotData =
    (snapshot.sections.hotspotUsers ?? []).some((row) => row.name && row.default !== "true") ||
    (snapshot.sections.hotspotUserProfiles ?? []).some((row) => row.name && row.name !== "default");
  const targetHotspot = scan.hotspotServers.length === 1 ? scan.hotspotServers[0] : null;
  const hotspot = {
    server: targetHotspot?.name ?? null,
    addressPool: targetHotspot?.addressPool ?? null,
    validated: !!targetHotspot?.addressPool,
  };
  if (hasHotspotData && scan.hotspotServers.length !== 1) {
    blockers.push(
      `Le rechange doit avoir exactement un serveur HotSpot activé pour rétablir les tickets ; ${scan.hotspotServers.length} trouvé(s).`,
    );
  } else if (hasHotspotData && targetHotspot && !targetHotspot.addressPool) {
    blockers.push(
      `Le serveur HotSpot cible « ${targetHotspot.name} » n'a pas de pool IP configuré.`,
    );
  }

  return {
    identity,
    wifi,
    ports,
    mikhmon,
    data: {
      tickets: (snapshot.sections.hotspotUsers ?? []).length,
      profiles: (snapshot.sections.hotspotUserProfiles ?? []).length,
      walledGarden: (snapshot.sections.walledGarden ?? []).length,
    },
    hotspot,
    portal,
    blockers,
    adjustments,
  };
}

/** Applique le nom RouterOS de l'ancien au rechange. */
export async function applyIdentity(
  client: RouterOSClient,
  identity: string,
  dryRun?: boolean,
): Promise<{ applied: boolean; error?: string }> {
  if (dryRun) return { applied: true };
  try {
    await client.talk(["/system/identity/set", `=name=${identity}`], 20000);
    return { applied: true };
  } catch (err) {
    return { applied: false, error: err instanceof Error ? err.message : "Erreur inconnue" };
  }
}
