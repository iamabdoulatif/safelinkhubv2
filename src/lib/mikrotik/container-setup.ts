"use server";

import { and, asc, eq, isNull, notInArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, organizations, captiveTemplates, walletTransactions, packages, bridges } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { RouterOSClient } from "./client";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry } from "./relay";
import { computeSubnetInfo, poolRangeExcludingGateway } from "@/lib/net/subnet";
import { getAppUrl } from "@/lib/net/app-url";
import { VOUCHER_PROFILES, type VoucherProfile } from "./voucher-profiles";
import { reserveRouterSerial } from "./router-serial-lock";
import {
  REMOTE_ACCESS_PORT,
  DOCKER_WEB_PORT,
  TUNNEL_ACCESS_PORT,
  HOTSPOT_BRIDGE_NAME,
  HOTSPOT_POOL_NAME,
} from "./constants";
import { ROUTER_SETUP_PROFILE } from "./router-setup-profile";
import { scenarioLabel, type DeploymentScenario } from "./device-catalog";
import { writeMikhmonSession } from "./mikhmon-session";
import { uploadCaptiveTemplatePackage } from "./captive-template-upload";
import { ensureWalledGarden } from "./walled-garden";
import { getOrgWalledGardenDisabledHosts } from "./walled-garden-config";
import { loadSafelinkBarakaPackage, type PackageFile } from "@/lib/captive-templates/package-files";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";
import { pickBalanceSource } from "@/lib/billing/balance-source";
import { awardReferral } from "@/lib/referrals/service";
import {
  evaluateAutoSetupGate,
  consumeAuthorization,
} from "@/lib/billing/auto-setup-authorization-service";
import { getWalletBalanceCents } from "@/lib/wallet/balance";
import { getSafecoinAccount } from "@/lib/safecoin/ledger";
import { autoSetupChargeScCents, chargeAutoSetup } from "@/lib/safecoin/service-charges";
import { ensureMikhmonTunnelAccess } from "./mikhmon-tunnel-access";
import { ensureSshTunnelAccess } from "./ssh-tunnel-access";

async function connectClient(router: typeof routers.$inferSelect, timeoutMs = 20000) {
  if (!router.host || !router.username || !router.passwordEncrypted) {
    throw new Error("Router is missing connection details.");
  }
  const password = decryptSecret(router.passwordEncrypted);
  const client = new RouterOSClient();
  if (router.connectionMethod === "vpn" || router.connectionMethod === "openvpn") {
    const tunnel = await openRouterTunnelWithRetry(router.host, router.apiPort ?? 8728, timeoutMs);
    await client.connectViaStream(tunnel.stream, router.username, password, timeoutMs);
  } else {
    await client.connect(router.host, router.apiPort ?? 8728, router.username, password, timeoutMs);
  }
  return client;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Sentence = Record<string, string>;

/**
 * Fixed identifiers reapplied on every run. The user never types these and
 * they never change between installs, so every router provisioned by
 * SafeLinkHub ends up with the exact same internal topology — only the
 * customer-facing fields (hotspot IP, hotspot name, DNS name, SSID) vary.
 */
const WAN_INTERFACE_NAME = "E1-WAN-FAI";
const DOCKER_BRIDGE_NAME = ROUTER_SETUP_PROFILE.containerBridge.name;
// Bridge name used by earlier SafeLinkHub installs, before the managed LAN
// bridge was renamed to SAFELINKHUB-BRIDGE — live routers still carrying it
// get migrated in place (rename or port-move + remove), never duplicated.
const LEGACY_HOTSPOT_BRIDGE_NAME = "HOTSPOT";
const LEGACY_DOCKER_BRIDGE_NAMES = ["CONTAINERS", "dockers", "DOCKER-SAFELINKHUB", "DOCKER"];
const VETH_NAME = "MIKHMON";
const VETH_ADDRESS = "11.11.11.11/28";
const VETH_GATEWAY = "11.11.11.1";
const DOCKER_NETWORK = "11.11.11.0/28";
// Image MikHmon installée par l'auto-setup. Repassée à mikhmon-sf-v1 (choix
// explicite de l'opérateur) : image multi-arch (arm/v6+v7, arm64, amd64), ~12 Mo,
// qui tient dans le tmpfs des petits boards (hAP ax lite/ax²). L'ancienne v3
// devient legacy → nettoyée au provisioning.
const CONTAINER_NAME = "mikhmon-sf-v1:latest";
const LEGACY_CONTAINER_NAMES = ["mikhmonv3-safelinkhub:latest"];
const REMOTE_IMAGE = "latif225/mikhmon-sf-v1:latest";
const NTP_SERVERS = ["196.200.131.160", "196.10.52.57"]; // Côte d'Ivoire NTP

function rosBoolean(value: string | undefined) {
  return value === "true" || value === "yes";
}

async function removeAddressByAddress(client: RouterOSClient, address: string) {
  const rows = await client.talk(["/ip/address/print", `?address=${address}`]).catch(() => [] as Sentence[]);
  for (const row of rows) {
    if (row[".id"]) {
      await client.talk(["/ip/address/remove", `=numbers=${row[".id"]}`]).catch(() => {});
    }
  }
}

async function migrateLegacyDockerBridge(client: RouterOSClient, log: string[]) {
  const targetRows = await client.talk(["/interface/bridge/print", `?name=${DOCKER_BRIDGE_NAME}`]).catch(() => [] as Sentence[]);
  let targetExists = targetRows.length > 0;

  for (const bridgeName of LEGACY_DOCKER_BRIDGE_NAMES) {
    const rows = await client.talk(["/interface/bridge/print", `?name=${bridgeName}`]).catch(() => [] as Sentence[]);
    for (const row of rows) {
      if (!row[".id"]) continue;
      if (!targetExists) {
        await client
          .talk(["/interface/bridge/set", `=numbers=${row[".id"]}`, `=name=${DOCKER_BRIDGE_NAME}`])
          .catch(() => {});
        targetExists = true;
        log.push(`OK: migrated Docker bridge ${bridgeName} to ${DOCKER_BRIDGE_NAME}`);
      } else {
        await client.talk(["/interface/bridge/remove", `=numbers=${row[".id"]}`]).catch(() => {});
        log.push(`OK: removed legacy Docker bridge ${bridgeName}`);
      }
    }
  }
}

/**
 * /container/add returns immediately while RouterOS pulls the image in the
 * background. Poll /container/print until status leaves "downloading"/
 * "extracting", then start it. This deliberately stops after one minute:
 * completing the pull can outlive an HTTP Server Action, while the container
 * keeps downloading on the router and start-on-boot will start it later.
 */
async function waitForImageAndStart(
  client: RouterOSClient,
  log: string[],
): Promise<DockerProvisionResult> {
  const maxAttempts = 12; // 12 * 5s = 1 minute
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(5000);
    let rows: Sentence[];
    try {
      rows = await client.talk(["/container/print"]);
    } catch {
      continue;
    }
    const container = rows.find((r) => r.name === CONTAINER_NAME);
    // RouterOS ≤7.22 reports "status"; 7.23+ replaced it with the boolean
    // "running" property. While the image is still extracting the row has
    // no name yet, so container stays undefined and "" keeps waiting on
    // both generations.
    const status =
      container?.status ??
      (container ? (container.running === "true" ? "running" : "stopped") : "");

    if (status === "stopped") {
      if (!container?.[".id"]) {
        log.push("FAIL (start container): RouterOS did not return a container ID");
        return { status: "failed", message: "RouterOS did not return the MikHmon container ID." };
      }
      try {
        await client.talk(["/container/start", `=numbers=${container[".id"]}`]);
        log.push(`OK: started container after image pull (status was "${status}")`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "error";
        log.push(`FAIL (start container): ${message}`);
        return { status: "failed", message };
      }
      return { status: "pending", message: "MikHmon is starting on the router." };
    }
    if (status === "running") {
      log.push("OK: container already running");
      return { status: "ready" };
    }
    // "downloading" / "extracting" / "" (not yet reported) -> keep waiting.
  }
  log.push(
    "PENDING (start container): image is still downloading after one minute — RouterOS continues the pull in the background.",
  );
  return {
    status: "pending",
    message: "L'image MikHmon est encore en cours de téléchargement sur le routeur.",
  };
}

type RunResult = { ok: true } | { ok: false; error: string };
type RunFn = (words: string[], label: string, timeoutMs?: number) => Promise<RunResult>;
type DockerProvisionResult = {
  status: "ready" | "pending" | "skipped" | "failed";
  message?: string;
};

/**
 * The DOCKERS bridge + MIKHMON veth + container engine + MikHmon
 * container — extracted out of provisionHotspotStack so the Topology
 * Builder page can trigger this exact same sequence on its own (the
 * admin doesn't have to run the whole hotspot/Wi-Fi auto-setup just to
 * get MikHmon up), without duplicating the logic.
 *
 * hotspotAddress is optional: when this runs standalone (no hotspot
 * configured yet), the hotspot-gateway-scoped "Docker NAT" dst-nat rule
 * is skipped — the full auto-setup adds it later once a hotspot address
 * exists. The Docker subnet masquerade, ACCES DISTANT, and tunnel NAT
 * rules don't depend on it and are always added.
 */
async function provisionDockerStack(
  client: RouterOSClient,
  log: string[],
  run: RunFn,
  opts: {
    supportsContainers: boolean;
    hasUsbStorage: boolean;
    hasLargeOnboardStorage?: boolean;
    // eMMC enterprise (CCR/CRS) : disque interne, jamais tmpfs (scénario 3).
    hasEmmcStorage?: boolean;
    hotspotAddress?: string;
    // Session MikHmon pré-remplie, injectée en variables d'env du conteneur :
    // l'image les lit au démarrage pour écrire sa « Paramètres de session »
    // (fin de la saisie manuelle IP/user/pass/nom hotspot/DNS/devise). Absente
    // en mode MikHmon-seul lancé depuis la topologie.
    mikhmonSession?: {
      name: string;
      mtIp: string;
      mtUser: string;
      mtPass: string;
      hotspotName?: string;
      dnsName?: string;
      currency?: string;
    };
  },
): Promise<DockerProvisionResult> {
  // The UI's own architecture/device-mode check (DetectedModelBadge) is
  // what sets opts.supportsContainers — but that detection runs once on
  // page load and can be stale or wrong (e.g. the admin enabled container
  // mode after detection ran). Re-verify directly against the router
  // right before touching anything container-related, since every
  // /container/* command below fails silently (caught by run()) when
  // device-mode hasn't actually been confirmed — previously this meant
  // the whole MikHmon step could quietly no-op without ever telling the
  // admin why.
  //
  // Only device-mode's own "container" flag is checked — /system/package
  // ?name=container was checked here too, but on ARM64 builds (e.g. hAP
  // ax³, confirmed against a real unit) Container support ships built
  // into the base RouterOS image rather than as a separate installable
  // package, so that query always returned zero rows and blocked this
  // step as "package not present" even with device-mode reporting
  // container=yes and a manual WinBox container install working fine.
  let containerPackageReady = opts.supportsContainers;
  if (containerPackageReady) {
    const [deviceMode] = await client
      .talk(["/system/device-mode/print"])
      .catch(() => [] as Sentence[]);
    const deviceModeContainerEnabled = deviceMode ? rosBoolean(deviceMode.container) : false;
    if (!deviceModeContainerEnabled) {
      containerPackageReady = false;
      log.push(
        'SKIP (MikHmon container): RouterOS device-mode still reports container=no — run "/system/device-mode/update mode=advanced container=yes hotspot=yes scheduler=yes fetch=yes activation-timeout=10m", confirm physically with the reset/mode button or a cold power cycle, then re-run auto-setup.',
      );
    }
  }

  if (containerPackageReady) {
    // DOCKERS bridge + veth pair: gives the MikHmon container its own
    // subnet, isolated from the hotspot LAN, router as gateway.
    await migrateLegacyDockerBridge(client, log);
    const dockerBridgeRows = await client
      .talk(["/interface/bridge/print", `?name=${DOCKER_BRIDGE_NAME}`])
      .catch(() => [] as Sentence[]);
    if (dockerBridgeRows.length === 0) {
      await run(["/interface/bridge/add", `=name=${DOCKER_BRIDGE_NAME}`], `${DOCKER_BRIDGE_NAME} bridge`);
    } else {
      log.push(`OK: ${DOCKER_BRIDGE_NAME} bridge already exists`);
    }

    // La veth est CORRIGÉE, jamais détruite-recréée.
    //
    // L'ancienne version faisait `/interface/veth/remove` puis `add`. Or le
    // conteneur MikHmon est attaché à cette veth : la supprimer la lui arrache,
    // et le `add` fabrique un OBJET NEUF auquel le conteneur n'est pas lié. Il
    // reste alors accroché à une interface disparue et affiche pour toujours
    // « could not acquire interface: no device », colonne Interface à
    // « unknown ». Constaté sur HSPT-YAHYA-GBEMA. Un simple re-run de
    // l'auto-setup suffisait à casser un MikHmon qui fonctionnait.
    const vethRows = await client
      .talk(["/interface/veth/print", `?name=${VETH_NAME}`])
      .catch(() => [] as Sentence[]);
    if (vethRows[0]?.[".id"]) {
      await run(
        [
          "/interface/veth/set",
          `=numbers=${vethRows[0][".id"]}`,
          `=address=${VETH_ADDRESS}`,
          `=gateway=${VETH_GATEWAY}`,
        ],
        "MIKHMON veth interface (corrigée en place, conteneur préservé)",
      );
    } else {
      await run(
        [
          "/interface/veth/add",
          `=name=${VETH_NAME}`,
          `=address=${VETH_ADDRESS}`,
          `=gateway=${VETH_GATEWAY}`,
          '=gateway6=',
          "=dhcp=no",
        ],
        "MIKHMON veth interface",
      );
    }
    // Rattachement au pont, seulement s'il manque : un /add sur un port déjà
    // présent échoue et polluait le journal à chaque passage.
    const vethPortRows = await client
      .talk(["/interface/bridge/port/print", `?interface=${VETH_NAME}`])
      .catch(() => [] as Sentence[]);
    if (vethPortRows.length === 0) {
      await run(
        ["/interface/bridge/port/add", `=bridge=${DOCKER_BRIDGE_NAME}`, `=interface=${VETH_NAME}`],
        `attach veth to ${DOCKER_BRIDGE_NAME} bridge`,
      );
    } else {
      log.push(`OK: veth ${VETH_NAME} already attached to ${DOCKER_BRIDGE_NAME}`);
    }

    await removeAddressByAddress(client, `${VETH_GATEWAY}/28`);
    await run(
      [
        "/ip/address/add",
        `=address=${VETH_GATEWAY}/28`,
        `=interface=${DOCKER_BRIDGE_NAME}`,
        `=network=${DOCKER_NETWORK.split("/")[0]}`,
      ],
      `${DOCKER_BRIDGE_NAME} bridge gateway address`,
    );

    // === SECTION C: Détection du stockage et choix du SCÉNARIO ===
    // Container engine — 3 scénarios de stockage (le 4e « pas de container » est
    // traité en amont par le skip supportsContainers). Voir device-catalog.ts /
    // deploymentScenario() pour le vocabulaire partagé avec l'UI :
    //   • SCÉNARIO 1 (USB/microSD, recommandé) : pull/extract sur la clé
    //     (usb1/pull) pour épargner la flash — formatée ext4 au besoin ;
    //   • SCÉNARIO 3 (eMMC/flash interne généreux : CCR/CRS, RB4011, RB3011,
    //     RB5009) : disque interne propre ("disk1"/Files) — JAMAIS tmpfs,
    //     survit au reboot ;
    //   • SCÉNARIO 2 (hAP ax lite/ax², sans USB ni slot disk1) : conteneur sur
    //     la flash NAND système « flash/… » — PERSISTANT au reboot (root-dir +
    //     layer-dir sur flash), le tmpfs ne sert plus que de scratch de pull.
    // Règle d'or : jamais tmpfs pour le root-dir — la session MikHmon doit survivre.
    // Un seul /disk/print, réutilisé par les 3 branches.
    const disks = await client.talk(["/disk/print"]).catch(() => []);
    const internalDisk = disks.find(
      (d) => typeof d.slot === "string" && /^disk\d*$/i.test(d.slot) && d.type !== "tmpfs",
    );
    // Clé USB / microSD DÉTECTÉE EN DIRECT (slot "usb1", "usb2"…). RouterOS
    // l'expose comme une entrée /disk même NON formatée. On ne se fie PAS au
    // seul flag opts.hasUsbStorage : il vient de la détection de l'UI au
    // chargement de la page et peut être PÉRIMÉ (clé branchée après la
    // détection, ou re-run de l'auto-setup) — d'où des ax³/Chateau PRO ax/L009
    // (requiresUsbForContainer, flash interne trop petite) qui basculaient à
    // tort en tmpfs/interne au lieu d'utiliser leur clé. Comme pour le device-
    // mode plus haut, on RE-VÉRIFIE l'USB en direct sur l'appareil. Même signal
    // que device-detect.ts (usb1DiskLive).
    const usbDisk = disks.find(
      (d) => typeof d.slot === "string" && /^usb\d+$/i.test(d.slot),
    );
    let containerRootDir = "tmp/mikhmon-app";
    let scenario: DeploymentScenario;

    if (opts.hasUsbStorage || usbDisk) {
      // --- SCÉNARIO 1: USB / microSD ---
      scenario = 1;
      // Slot réel de la clé (usb1/usb2/microSD), pas un "usb1" en dur.
      const usbSlot = usbDisk?.slot ?? "usb1";
      // RouterOS exposes a plugged-in USB stick as an unformatted /disk
      // entry (slot usb1) — /container/config's tmpdir=<usb>/pull silently
      // fails to pull/extract images until that slot is formatted ext4
      // (this is MikroTik's own documented Container prerequisite, the
      // same "Format Drive" step done by hand in WinBox). Re-running
      // auto-setup on an already-formatted stick must not reformat it —
      // that would wipe whatever's already pulled/cached — so this only
      // formats when the slot isn't already ext4.
      if (usbDisk && usbDisk["file-system"] !== "ext4") {
        await run(
          ["/disk/format-drive", `=slot=${usbSlot}`, "=file-system=ext4"],
          `format USB stick (${usbSlot}, ext4)`,
          60000,
        );
      } else if (!usbDisk) {
        log.push(
          "SKIP (format USB stick): no USB disk detected (slot usb*) — plug the USB stick in and re-run auto-setup before MikHmon can use it.",
        );
      }

      containerRootDir = `${usbSlot}/mikhmon-app`;
      const configured = await run(
        ["/container/config/set", "=registry-url=https://registry-1.docker.io", `=tmpdir=${usbSlot}/pull`],
        `container engine config (USB storage ${usbSlot})`,
      );
      if (!configured.ok) return { status: "failed", message: configured.error };
    } else if (internalDisk?.slot || opts.hasLargeOnboardStorage || opts.hasEmmcStorage) {
      // --- SCÉNARIO 3: eMMC / flash interne généreux (JAMAIS tmpfs) ---
      // Le board rapporte son propre slot interne ("disk1"/… live-détecté, donc
      // pas limité aux modèles du catalogue), OU il est flaggé large-storage /
      // eMMC (RB3011/RB5009 NAND, CCR/CRS eMMC : assez de mémoire interne pour
      // héberger MikHmon sans clé USB, image persistante au reboot). Sans slot
      // listé, les chemins sont de simples dossiers sur la storage Files/flash
      // du routeur — pas de /disk/add, pas de formatage.
      scenario = 3;
      const root = internalDisk?.slot ? `${internalDisk.slot}/` : "";
      containerRootDir = `${root}mikhmon-app`;
      const configured = await run(
        [
          "/container/config/set",
          "=registry-url=https://registry-1.docker.io",
          `=tmpdir=${root}pull`,
        ],
        `container engine config (stockage interne${internalDisk?.slot ? ` ${internalDisk.slot}` : ""})`,
      );
      if (!configured.ok) return { status: "failed", message: configured.error };
    } else {
      // --- SCÉNARIO 2: hAP ax lite/ax² (flash NAND interne, PAS de slot USB) ---
      // Ces boards n'ont ni clé USB ni slot /disk interne (disk1) — mais ils ont
      // TOUS la flash NAND système, adressable « flash/… », PERSISTANTE au reboot.
      // C'est là que le conteneur DOIT vivre. On plaçait avant le conteneur en
      // tmpfs (RAM) : la session MikHmon (src/src/include/config.php) et les
      // layers de l'image étaient PERDUS à chaque extinction → l'admin devait
      // recréer la session à chaque allumage, bug récurrent signalé sur HSPT-WIFI.
      // Modèle de référence validé en prod : un hAP ax lite (HSPT-YAHYA-GBEMA)
      // dont le conteneur tourne en root-dir=/flash/mikhmon-root +
      // layer-dir=/flash/mikhmon-layers — la session y reste INTACTE reboot après
      // reboot, sans aucun scheduler de sauvegarde. On reproduit exactement ça :
      // root-dir ET layer-dir sur la flash (persistant, et évite un re-pull de
      // l'image au boot). Le tmpfs ne sert plus que de SCRATCH d'extraction
      // pendant le pull (tmpdir=tmp/pull), pour épargner la NAND — les writes
      // MikHmon en régime établi (config.php aux changements de session) restent
      // légers, largement soutenables par la NAND (cf. board de référence, des
      // mois d'uptime cumulé).
      scenario = 2;
      containerRootDir = "flash/mikhmon-app";
      if (!disks.some((d) => d.slot === "tmp")) {
        const tmpfsCreated = await run(
          ["/disk/add", "=slot=tmp", "=tmpfs-max-size=150000000", "=type=tmpfs"],
          "tmpfs disk slot (scratch de pull uniquement)",
        );
        if (!tmpfsCreated.ok) {
          return {
            status: "failed",
            message: `MikHmon requires 150 MB of free RAM or external storage: ${tmpfsCreated.error}`,
          };
        }
      }
      // layer-dir sur la flash = image persistante (pas de re-pull au boot) ;
      // tmpdir sur tmpfs = extraction en RAM (moins d'écritures NAND au pull).
      const configured = await run(
        [
          "/container/config/set",
          "=registry-url=https://registry-1.docker.io",
          "=layer-dir=flash/mikhmon-layers",
          "=tmpdir=tmp/pull",
        ],
        "container engine config (flash NAND persistante + scratch tmpfs)",
      );
      if (!configured.ok) return { status: "failed", message: configured.error };
    }
    log.push(`OK: Scénario ${scenario} sélectionné (${scenarioLabel(scenario)})`);

    for (const name of LEGACY_CONTAINER_NAMES) {
      await client.talk(["/container/remove", `=numbers=${name}`]).catch(() => {});
    }

    // Session MikHmon auto-configurée : on pose un envlist "mikhmon" que l'image
    // lit au démarrage pour écrire sa « Paramètres de session » (nom, IP MikroTik
    // = passerelle du veth, user/pass API, nom hotspot, DNS, devise) — l'admin
    // n'a plus rien à taper. Purge de l'ancien envlist d'abord (idempotent).
    const MIKHMON_ENVLIST = "mikhmon";
    let mikhmonEnvlist: string | null = null;
    if (opts.mikhmonSession) {
      const s = opts.mikhmonSession;
      const existingEnvs = await client
        .talk(["/container/envs/print", `?list=${MIKHMON_ENVLIST}`])
        .catch(() => [] as Sentence[]);
      for (const e of existingEnvs) {
        if (e[".id"]) {
          await client.talk(["/container/envs/remove", `=numbers=${e[".id"]}`]).catch(() => {});
        }
      }
      const pairs: [string, string | undefined][] = [
        ["MIKHMON_SESSION", s.name],
        ["MIKHMON_MT_IP", s.mtIp],
        ["MIKHMON_MT_USER", s.mtUser],
        ["MIKHMON_MT_PASS", s.mtPass],
        ["MIKHMON_HOTSPOT_NAME", s.hotspotName],
        ["MIKHMON_DNS", s.dnsName],
        ["MIKHMON_CURRENCY", s.currency],
      ];
      let added = 0;
      let envFailed = false;
      for (const [key, value] of pairs) {
        if (!value) continue;
        const envAdded = await run(
          ["/container/envs/add", `=list=${MIKHMON_ENVLIST}`, `=key=${key}`, `=value=${value}`],
          `MikHmon env ${key}`,
        );
        if (!envAdded.ok) {
          // Certains builds du paquet container (RouterOS 7.23.x sur les petits
          // boards) n'exposent pas /container/envs : impossible de pré-remplir
          // la « Paramètres de session ». On n'échoue PAS l'install pour autant —
          // le conteneur s'installe quand même (sans =envlist=) et l'admin saisit
          // la session MikHmon à la main. Même logique que le fallback envlist.
          log.push(
            `WARN: impossible de pré-remplir la session MikHmon (${envAdded.error}) — à configurer manuellement.`,
          );
          envFailed = true;
          break;
        }
        added++;
      }
      // On ne pose =envlist= que si TOUTES les variables ont été écrites : une
      // session à moitié remplie serait pire que pas de pré-remplissage du tout.
      if (added > 0 && !envFailed) mikhmonEnvlist = MIKHMON_ENVLIST;
    }

    let containers = await client.talk(["/container/print"]).catch(() => [] as Sentence[]);

    // MIGRATION tmpfs → flash (scénario 2, routeurs DÉJÀ installés). Un conteneur
    // MikHmon posé sur le tmpfs RAM (root-dir « tmp/… », l'ancien comportement)
    // PERD sa session à chaque reboot. Maintenant qu'on cible la flash NAND
    // persistante, on RETIRE l'ancien conteneur tmpfs pour qu'il soit recréé plus
    // bas sur « flash/mikhmon-app ». La session config.php du tmpfs est de toute
    // façon éphémère (déjà reperdue à chaque extinction) : l'admin la recrée une
    // ULTIME fois, puis elle persiste définitivement. On ne touche QU'aux
    // conteneurs sur tmpfs — un conteneur déjà sur flash/usb/disk1 est préservé.
    if (scenario === 2) {
      const staleTmpfs = containers.filter((c) => {
        const rootDir = String(c["root-dir"] ?? "");
        const isMikhmon =
          c.name === CONTAINER_NAME ||
          /mikhmon/i.test(String(c.name ?? "")) ||
          /mikhmon/i.test(rootDir);
        return isMikhmon && /^tmp\//.test(rootDir);
      });
      for (const c of staleTmpfs) {
        if (!c[".id"]) continue;
        await client.talk(["/container/stop", `=numbers=${c[".id"]}`]).catch(() => {});
        const removed = await run(
          ["/container/remove", `=numbers=${c[".id"]}`],
          `migration tmpfs→flash : retrait de l'ancien conteneur MikHmon (root-dir=${c["root-dir"]})`,
        );
        if (removed.ok) {
          log.push(
            "OK: ancien conteneur MikHmon (tmpfs) retiré — recréé sur la flash NAND persistante (session à recréer une dernière fois, puis conservée aux reboots)",
          );
        }
      }
      if (staleTmpfs.length) {
        containers = await client.talk(["/container/print"]).catch(() => [] as Sentence[]);
      }
    }

    const existingContainer = containers.find(
      (container) =>
        container.name === CONTAINER_NAME || container["root-dir"] === containerRootDir,
    );
    // Le paramètre =envlist= (pré-remplissage de la session MikHmon via l'envlist
    // "mikhmon") est documenté sur /container/add|set, mais certains builds du
    // paquet container (vu sur RouterOS 7.23.1, hAP ax lite) le REJETTENT avec
    // « unknown parameter envlist » et font échouer toute l'install. On l'essaie
    // donc puis, si RouterOS ne le connaît pas, on réinstalle SANS : le conteneur
    // s'installe quand même, la session MikHmon se configure alors à la main
    // (l'envlist reste posé, réutilisé par les routeurs dont le build le gère).
    const ENVLIST_UNSUPPORTED = /envlist/i;
    if (existingContainer?.[".id"]) {
      // `=interface=` est RÉAFFIRMÉ à chaque passage — c'est ce qui répare les
      // routeurs dont le conteneur a perdu sa veth (voir le commentaire sur la
      // veth plus haut). Sans lui, un conteneur orphelin le restait
      // définitivement : `set` ne touchait que start-on-boot.
      const baseSet = [
        "/container/set",
        `=numbers=${existingContainer[".id"]}`,
        `=interface=${VETH_NAME}`,
        "=start-on-boot=yes",
      ];
      let containerUpdated = await run(
        mikhmonEnvlist ? [...baseSet, `=envlist=${mikhmonEnvlist}`] : baseSet,
        "preserve existing MikHmon container download",
      );
      if (!containerUpdated.ok && mikhmonEnvlist && ENVLIST_UNSUPPORTED.test(containerUpdated.error)) {
        log.push(
          "WARN: cette version de RouterOS ignore =envlist= sur /container/set — session MikHmon à configurer manuellement.",
        );
        containerUpdated = await run(baseSet, "preserve existing MikHmon container download (sans envlist)");
      }
      // Repli si ce build refuse `=interface=` sur /container/set, comme
      // certains refusent `=envlist=` : on retombe sur la mise à jour minimale
      // plutôt que de faire échouer tout l'auto-setup. Le conteneur orphelin ne
      // sera pas réparé sur ces builds — il faudra le recréer — mais le reste
      // de la configuration passe.
      if (!containerUpdated.ok && /interface/i.test(containerUpdated.error)) {
        log.push(
          "WARN: cette version de RouterOS refuse =interface= sur /container/set — si MikHmon affiche « could not acquire interface », supprimez le conteneur et relancez pour qu'il soit recréé.",
        );
        containerUpdated = await run(
          ["/container/set", `=numbers=${existingContainer[".id"]}`, "=start-on-boot=yes"],
          "preserve existing MikHmon container download (sans interface)",
        );
      }
      if (!containerUpdated.ok) return { status: "failed", message: containerUpdated.error };
      log.push("OK: existing MikHmon container download preserved");
    } else {
      const baseAdd = [
        "/container/add",
        `=interface=${VETH_NAME}`,
        `=name=${CONTAINER_NAME}`,
        `=remote-image=${REMOTE_IMAGE}`,
        `=root-dir=${containerRootDir}`,
        "=start-on-boot=yes",
      ];
      let containerAdded = await run(
        mikhmonEnvlist ? [...baseAdd, `=envlist=${mikhmonEnvlist}`] : baseAdd,
        "container image install (auto-start on boot enabled)",
      );
      if (!containerAdded.ok && mikhmonEnvlist && ENVLIST_UNSUPPORTED.test(containerAdded.error)) {
        log.push(
          "WARN: cette version de RouterOS ignore =envlist= sur /container/add — installation sans pré-remplissage de la session MikHmon (à configurer manuellement).",
        );
        containerAdded = await run(baseAdd, "container image install (sans envlist)");
      }
      if (!containerAdded.ok) {
        return { status: "failed", message: containerAdded.error };
      }
    }
    const containerResult = await waitForImageAndStart(client, log);
    if (containerResult.status === "failed") return containerResult;

    // Filet anti-« conteneur stopped après reboot ». Sur RouterOS, le
    // start-on-boot=yes du conteneur se déclenche TÔT au boot — souvent AVANT
    // que le disque (USB/flash) et l'interface veth soient prêts → RouterOS
    // tente une fois, échoue, puis abandonne → MikHmon reste "stopped" jusqu'à
    // un redémarrage manuel. On pose un scheduler "startup" qui, 45 s après le
    // boot puis toutes les 30 s pendant ~3 min, (re)démarre le conteneur tant
    // qu'il n'est pas lancé — idempotent : démarrer un conteneur déjà lancé est
    // avalé par le on-error. Remove par nom d'abord (pas de doublon aux
    // re-runs / à la « Réparation »). Depuis que le scénario 2 (ax lite/ax²)
    // place le conteneur sur la flash NAND persistante, le conteneur SURVIT au
    // reboot dans tous les scénarios — ce scheduler garantit juste qu'il est
    // (re)démarré au boot (mêmes rôle que le mikhmon-watchdog du board de
    // référence). Ce correctif s'applique aussi aux routeurs DÉJÀ installés dès
    // leur prochaine passe d'auto-setup / réparation.
    await client.talk(["/system/scheduler/remove", "=numbers=MIKHMON_BOOT"]).catch(() => {});
    await run(
      [
        "/system/scheduler/add",
        "=name=MIKHMON_BOOT",
        "=start-time=startup",
        `=on-event=:delay 45s; :local n 0; :while ($n < 6) do={ :do { /container/start [/container/find where name="${CONTAINER_NAME}"] } on-error={}; :delay 30s; :set n ($n + 1); }`,
        "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
        "=comment=Redemarre MikHmon au boot (anti start-on-boot race)",
      ],
      "MikHmon boot auto-start scheduler",
    );

    // Pré-configuration AUTOMATIQUE de la session MikHmon : on écrit directement
    // le config.php du conteneur (l'envlist étant rejeté par RouterOS 7.23.x sur
    // ces boards). Valeurs : session « SafeLinkHub » (fixe), IP MikroTik = veth
    // 11.11.11.1 (fixe), user/pass = compte API, Nom du Hotspot = nom du Server
    // Profile, Nom DNS = passerelle du hotspot, devise fcfa, autoload 10, délai
    // d'inactivité = disable, rapport en direct = enable. Voir mikhmon-session.ts.
    if (opts.mikhmonSession) {
      const s = opts.mikhmonSession;
      const cont = (await client.talk(["/container/print"]).catch(() => [] as Sentence[])).find(
        (c) => c.name === CONTAINER_NAME,
      );
      const wrote = await writeMikhmonSession(
        client,
        containerRootDir,
        "SafeLinkHub",
        {
          ip: s.mtIp,
          user: s.mtUser,
          pass: s.mtPass,
          hotspot: s.hotspotName ?? "",
          dns: opts.hotspotAddress?.trim() || s.dnsName || "",
          currency: s.currency ?? "fcfa",
          autoload: 10,
          iface: 1,
          infolp: "",
          idle: "disable",
          livereport: "enable",
        },
        cont?.[".id"],
      ).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : "erreur" }));
      log.push(
        wrote.ok
          ? "OK: session MikHmon pré-configurée automatiquement (SafeLinkHub)"
          : `WARN: session MikHmon non pré-remplie (${wrote.error}) — à configurer à la main.`,
      );
    }

    // NAT: Docker subnet masquerade, remote-access dst-nat, and a second
    // dst-nat reachable via the hotspot gateway IP itself. Each checked
    // by its (chain, action, comment) signature first — none of these
    // are otherwise unique enough for RouterOS to reject a duplicate
    // /add, so without this they'd pile up on every re-run.
    const existingDockerMasquerade = await client
      .talk(["/ip/firewall/nat/print", "?chain=srcnat", "?action=masquerade", "?comment=Docker NAT", `?src-address=${DOCKER_NETWORK}`])
      .catch(() => []);
    if (existingDockerMasquerade.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=srcnat",
          `=src-address=${DOCKER_NETWORK}`,
          "=action=masquerade",
          "=comment=Docker NAT",
        ],
        "Docker subnet masquerade",
      );
    }
    const existingRemoteAccessNat = await client
      .talk(["/ip/firewall/nat/print", "?chain=dstnat", "?action=dst-nat", "?comment=ACCES DISTANT"])
      .catch(() => []);
    if (existingRemoteAccessNat.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=dstnat",
          `=dst-port=${REMOTE_ACCESS_PORT}`,
          "=protocol=tcp",
          "=action=dst-nat",
          `=to-addresses=${VETH_ADDRESS.split("/")[0]}`,
          "=to-ports=80",
          "=comment=ACCES DISTANT",
        ],
        "remote-access dst-nat port forward",
      );
    }
    if (opts.hotspotAddress) {
      const existingDockerWebNat = await client
        .talk(["/ip/firewall/nat/print", "?chain=dstnat", "?action=dst-nat", "?comment=Docker NAT", `?dst-port=${DOCKER_WEB_PORT}`])
        .catch(() => []);
      if (existingDockerWebNat.length === 0) {
        await run(
          [
            "/ip/firewall/nat/add",
            "=chain=dstnat",
            `=dst-address=${opts.hotspotAddress}`,
            `=dst-port=${DOCKER_WEB_PORT}`,
            "=protocol=tcp",
            "=action=dst-nat",
            `=to-addresses=${VETH_ADDRESS.split("/")[0]}`,
            "=to-ports=80",
            "=comment=Docker NAT",
          ],
          "Docker web dst-nat port forward",
        );
      }
    } else {
      log.push(
        "SKIP (Docker web dst-nat port forward): no hotspot address configured yet — added automatically once the hotspot auto-setup runs.",
      );
    }

    // Third path to MikHmon, deliberately with no dst-address filter (like
    // ACCES DISTANT) so it answers a packet addressed to *any* IP the
    // router owns — including its WireGuard/OpenVPN tunnel address. That
    // lets SafeLinkHub's relay reach MikHmon over the same tunnel already
    // used for WinBox/WebFig/SSH direct access, which works even when the
    // router's WAN sits behind a carrier CGNAT that makes ACCES DISTANT
    // (port 8088, WAN-only) unreachable from the public internet.
    const existingTunnelNat = await client
      .talk(["/ip/firewall/nat/print", "?chain=dstnat", "?action=dst-nat", "?comment=MikHmon via tunnel"])
      .catch(() => []);
    if (existingTunnelNat.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=dstnat",
          `=dst-port=${TUNNEL_ACCESS_PORT}`,
          "=protocol=tcp",
          "=action=dst-nat",
          `=to-addresses=${VETH_ADDRESS.split("/")[0]}`,
          "=to-ports=80",
          "=comment=MikHmon via tunnel",
        ],
        "MikHmon tunnel dst-nat port forward",
      );
    }
    await ensureMikhmonTunnelAccess(client, log);
    return containerResult;
  } else if (!opts.supportsContainers) {
    log.push(
      "SKIP (MikHmon container): architecture does not support RouterOS Container — hotspot/WiFi configured, no container step run",
    );
  }

  return {
    status: "skipped",
    message: "Le mode conteneur RouterOS n'est pas disponible ou n'est pas activé.",
  };
}

export type HotspotStackOptions = {
  hotspotAddress: string; // chosen by the admin, e.g. "10.0.0.1"
  hotspotPrefixBits: number; // chosen by the admin, e.g. 8, 19, 23, 24
  hotspotName: string; // chosen by the admin, e.g. "MIRADOR-WIFI"
  dnsName: string; // chosen by the admin, e.g. "mirador.ci"
  // RouterOS system identity (/system/identity). Optional — when omitted,
  // falls back to "HSPT-<first word of hotspotName>" as before, so existing
  // callers that never set this keep their previous behavior.
  identity?: string;
  hasUsbStorage: boolean; // ax2 / hAP ax lite have none; some boards take a USB stick
  // True on boards with enough onboard flash (RB4011, etc.) to skip both
  // USB and tmpfs and use a plain "disk1" Files directory instead. Ignored
  // when hasUsbStorage is true.
  hasLargeOnboardStorage?: boolean;
  // True sur les CCR/CRS à eMMC interne : force le disque interne (disk1),
  // jamais tmpfs (scénario 3), même si le slot n'est pas encore live-détecté.
  hasEmmcStorage?: boolean;
  // RouterOS Container only runs on arm/arm64/tile — mipsbe/mmips/smips
  // boards (RB951, hEX, hEX S, plain wAP, ...) skip the DOCKERS/MikHmon
  // step entirely rather than failing partway through.
  supportsContainers: boolean;
  reboot: boolean;
  // Full voucher profile definitions to create on this router — lets each
  // operator sell only the voucher durations they actually use, including
  // custom ones the admin defined themselves (see voucher-profiles.ts'
  // buildVoucherProfile), not just the 6 bundled presets. Omitted/empty
  // means "create the bundled presets" (matches prior behavior for callers
  // that don't pass this field yet).
  voucherProfiles?: VoucherProfile[];
  // WiFi network name broadcast on both radios (2.4GHz + 5GHz). Optional —
  // boards with no WiFi radio at all (CCR routers, plain switches) just
  // skip this step instead of failing.
  ssid?: string;
  // RouterOS won't transmit on a WiFi radio until a regulatory country is
  // set — without it, disabled=no can silently leave the radio inactive.
  wifiCountry?: string; // default "United States" — widest-permissive regulatory domain
  // Captive-portal HTML directory name (RouterOS /hotspot/<dir>/, applied to
  // both html-directory and html-directory-override). Default "hotspot"
  // matches the directory the bundled portal templates already use.
  htmlDirectory?: string;
  // Hotspot user names to create with password equal to username (e.g. ["admin",
  // "president01@"]) — optional and empty by default, since this is a
  // multi-tenant SaaS and hardcoding the same login across every
  // customer's router would be a collision/security smell, not a generic
  // default.
  // Chaîne = login dont le mot de passe vaut le login (compat historique) ;
  // objet { name, password } = login avec mot de passe distinct — ex. le compte
  // administrateur du portail (accès internet) saisi à l'auto-setup.
  defaultHotspotUsers?: Array<string | { name: string; password?: string }>;
  // Whether to push the bundled SafeLinkHub captive-portal package onto
  // the hotspot profile's html-directory as part of this same run.
  // Defaults to true (existing behavior for callers that don't pass this
  // field yet) — the wizard's dedicated step lets the admin opt out and
  // keep RouterOS's bare factory-default login page instead.
  installCaptivePortal?: boolean;
  // Mirrors each custom voucher profile created this run as a sellable
  // "Forfait" on /admin/packages — the admin already typed name/price/
  // duration once on the wizard's voucher-profile step, so they shouldn't
  // have to re-enter the same plan by hand on the Packages page too.
  // Upserted by name per org: re-running with the same name updates price/
  // duration instead of duplicating the row.
  // Branding du portail captif scopé à CE routeur, saisi dans l'auto-setup :
  // contact support/paiement + « espaces vendeurs ». Persisté sur la ligne
  // routers (portalSupportWhatsapp/Phone/Vendors) et rendu en priorité sur le
  // branding du modèle. undefined = ne pas toucher ; "" / [] = effacer.
  portalSupportWhatsapp?: string;
  portalSupportPhone?: string;
  portalVendors?: { name: string; location: string; phone: string }[];
  packagesToSync?: {
    name: string;
    priceCents: number;
    durationValue: number;
    durationUnit: string;
    // Débit personnalisé du forfait (Mbps) — miroir du rate-limit du profil.
    // Optionnels : absents → on garde le débit par défaut du forfait (5/5).
    uploadMbps?: number;
    downloadMbps?: number;
  }[];
  // Deprecated compatibility field: older saved auto-setup configs may
  // still contain a custom bridge name, but the managed hotspot bridge is
  // now canonicalized to SAFELINKHUB-BRIDGE so WiFi, DHCP, hotspot and
  // captive-portal checks all target the same RouterOS interface.
  bridgeName?: string;
  // Lets the admin rename the RouterOS hotspot server instead of always
  // getting "hotspot1". Trimmed and falls back to the default when blank.
  serverName?: string;
  // Which of the org's "package" captive-template rows to install when
  // installCaptivePortal isn't explicitly false — lets the admin pick
  // between several bundled/custom portals (e.g. SafeLinkHub vs. Yahya
  // WiFi) on the wizard's "Portail captif" step instead of this always
  // grabbing whichever package template happens to be found first.
  // Falls back to that "first found, else create the bundled default"
  // behavior when omitted, for callers that never offered a choice.
  captiveTemplateId?: string;
};

/**
 * Lets the wizard show pricing/wallet status *before* the admin clicks
 * "Lancer l'auto-setup complet" — same eligibility rule provisionHotspotStack
 * itself enforces, just read-only, so the UI can render a paywall instead of
 * letting the admin click through into an error.
 */
export async function getAutoSetupBillingStatus(routerId: string, supportsContainers: boolean) {
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

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, router.orgId))
    .limit(1);
  if (!org) return { error: "Organization not found." };

  // Superadmins (SafeLinkHub staff accounts) never pay, no matter how
  // many routers their org already has — unlimited by role, not by
  // org-level trial state, so this short-circuits before any of the
  // normal free-trial/wallet checks below.
  if (isSuperAdmin(session.role)) {
    return {
      success: true,
      isFree: true,
      alreadyBilled: false,
      feeCents: 0,
      walletBalanceCents: 0,
      sufficientBalance: true,
      unlimited: true as const,
    };
  }

  if (router.autoSetupBilled) {
    return { success: true, isFree: true, alreadyBilled: true, feeCents: 0, walletBalanceCents: 0, sufficientBalance: true };
  }

  // One-off, time-boxed exception for this specific org (e.g. a second
  // free router for a year) — date-bound, so deleting and re-adding a
  // router within the window stays free, unlike the one-time
  // freeRouterSetupUsed flag below.
  if (org.bonusFreeRouterUntil && org.bonusFreeRouterUntil.getTime() > Date.now()) {
    return { success: true, isFree: true, alreadyBilled: false, feeCents: 0, walletBalanceCents: 0, sufficientBalance: true };
  }

  if (!org.freeRouterSetupUsed) {
    return { success: true, isFree: true, alreadyBilled: false, feeCents: 0, walletBalanceCents: 0, sufficientBalance: true };
  }

  const feeCents = autoSetupFeeCentsFor(supportsContainers);
  const walletBalanceCents = await getWalletBalanceCents(org.id);
  return {
    success: true,
    isFree: false,
    alreadyBilled: false,
    feeCents,
    walletBalanceCents,
    sufficientBalance: walletBalanceCents >= feeCents,
  };
}

/**
 * Provisions a full SafeLinkHub hotspot router end to end, mirroring a
 * working device export (RouterOS 7.23, container-capable hAP/CCR boards):
 * renames the WAN port, builds the SAFELINKHUB-BRIDGE across every remaining
 * ethernet port, sets up the hotspot pool/DHCP/profile/DNS name, opens the
 * required NAT rules, then provisions the DOCKERS bridge + veth + container
 * (MikHmon) the same way every time, and finally locks down services,
 * timezone, identity and NTP before rebooting.
 */
export async function provisionHotspotStack(
  routerId: string,
  opts: HotspotStackOptions,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  if (!opts.hotspotAddress.trim()) return { error: "L'adresse du hotspot est requise." };
  if (!opts.hotspotName.trim()) return { error: "Le nom du hotspot est requis." };

  const subnet = computeSubnetInfo(opts.hotspotAddress.trim(), opts.hotspotPrefixBits);
  if (!subnet) {
    return { error: "Adresse IP ou préfixe (/bits) invalide." };
  }

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || (router.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Router not found." };
  }

  // Porte de monétisation : le paiement est lié à ce routeur et à son
  // payeur. Après la première exécution, ce même compte garde le droit de
  // relancer autant de fois que nécessaire pour réparer une configuration
  // partielle, sans nouvelle facturation.
  const gate = await evaluateAutoSetupGate(session, routerId);
  if (!gate.ok) {
    return {
      error:
        "Auto-Setup payant : votre paiement doit être validé par l'administrateur avant de lancer la configuration.",
      needsAuthorization: true as const,
    };
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, router.orgId))
    .limit(1);
  if (!org) {
    return { error: "Organization not found." };
  }

  const bridgeName = HOTSPOT_BRIDGE_NAME;
  const serverName = opts.serverName?.trim() || "hotspot1";
  // Named after the operator's hotspot/brand name (e.g. "SHIAH WIFI"),
  // matching a normal/reference RouterOS hotspot config, not after the
  // technical server name ("hotspot1") — that earlier choice was a
  // workaround for orphaned profiles when the brand name changed between
  // runs, but the server/profile lookup below now matches by which
  // profile the live server actually references (not by name), so
  // renaming this safely updates that same profile in place either way.
  const hotspotProfileName = opts.hotspotName;
  const previousBridgeName =
    router.hotspotBridgeName?.trim() || opts.bridgeName?.trim() || HOTSPOT_BRIDGE_NAME;

  // One free auto-setup run per org (tracked on the org, survives the
  // router being deleted and re-added), then a one-time fee per
  // additional router charged to the wallet — see
  // lib/billing/auto-setup-pricing.ts. A router that already consumed
  // either the trial or a paid charge re-runs for free every time after
  // (tweaking config shouldn't cost again). Superadmins are unlimited by
  // role — never billed, regardless of how many routers their org has
  // already configured — matching getAutoSetupBillingStatus above.
  const hasBonusFreeRouter =
    !!org.bonusFreeRouterUntil && org.bonusFreeRouterUntil.getTime() > Date.now();
  // TEMPORAIRE — quand l'accès vient d'une autorisation manuelle validée, le
  // paiement a déjà eu lieu hors-app : on ne débite donc PAS aussi le
  // portefeuille (sinon double facturation). La porte remplace la facturation
  // wallet pour les non-superadmins. TODO: Remplacer par paiement intégré.
  const billableCents =
    isSuperAdmin(session.role) ||
    hasBonusFreeRouter ||
    gate.reason === "authorized" ||
    gate.reason === "paid_retry" ||
    gate.reason === "replacement_paid_retry"
      ? null
      : router.autoSetupBilled
        ? null
        : org.freeRouterSetupUsed
          ? autoSetupFeeCentsFor(opts.supportsContainers)
          : 0;

  const safecoinAccount = billableCents && billableCents > 0
    ? await getSafecoinAccount(org.id)
    : null;
  const safecoinRequiredScCents = safecoinAccount
    ? await autoSetupChargeScCents({ supportsContainers: opts.supportsContainers })
    : 0;

  // Source du débit quand l'auto-setup n'a PAS été payé d'avance : portefeuille
  // FCFA en priorité, sinon Safecoins — même règle que payAutoSetupFromBalance
  // et que l'accès distant. Avant, la simple EXISTENCE d'un compte Safecoin
  // rendait le portefeuille inaccessible : une org avec de quoi payer en FCFA
  // mais 0 SC était bloquée alors que son solde suffisait.
  let balanceSource: "wallet" | "safecoin" | null = null;

  if (billableCents !== null && billableCents > 0) {
    const walletBalanceCents = await getWalletBalanceCents(org.id);
    balanceSource = pickBalanceSource({
      walletFcfa: walletBalanceCents,
      amountFcfa: billableCents,
      safecoinScCents: safecoinAccount?.balanceScCents ?? 0,
      requiredScCents: safecoinRequiredScCents,
      safecoinAvailable: !!safecoinAccount,
    });
    if (!balanceSource && safecoinAccount) {
      return {
        error: `Solde insuffisant : il faut ${billableCents.toLocaleString("fr-FR")} FCFA au portefeuille ou ${(safecoinRequiredScCents / 100).toLocaleString("fr-FR")} SC pour configurer ce routeur supplémentaire (portefeuille : ${walletBalanceCents.toLocaleString("fr-FR")} FCFA, Safecoins : ${(safecoinAccount.balanceScCents / 100).toLocaleString("fr-FR")} SC).`,
        paywall: true as const,
        requiredScCents: safecoinRequiredScCents,
        requiredCents: billableCents,
        walletBalanceCents,
      };
    }
    if (!balanceSource) {
      return {
        error: `Solde du portefeuille insuffisant : il faut ${billableCents.toLocaleString("fr-FR")} FCFA pour configurer ce routeur supplémentaire (solde actuel : ${walletBalanceCents.toLocaleString("fr-FR")} FCFA).`,
        paywall: true as const,
        requiredCents: billableCents,
        walletBalanceCents,
      };
    }
  }

  let client: RouterOSClient;
  try {
    client = await connectClient(router);
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Could not connect: ${err.message}` : "Could not connect.",
    };
  }

  // Verrou anti-abus : un MikroTik (par numéro de série) ne peut être
  // auto-configuré qu'une fois. Refuse si son SN est déjà verrouillé par un
  // autre routeur (sauf réinitialisation superadmin). Re-run sur le même routeur
  // autorisé. Voir router-serial-lock.ts.
  const serialLock = await reserveRouterSerial(client, routerId, session.orgId, {
    // Superadmin : aucune restriction — peut (re)configurer n'importe quel
    // MikroTik autant de fois qu'il veut ; le verrou SN est transféré, pas refusé.
    force: isSuperAdmin(session.role),
  }).catch(() => ({ ok: true, serial: null }) as const);
  if (!serialLock.ok) {
    client.close();
    return { error: serialLock.error };
  }

  let safecoinCharge: { created: boolean; entryId?: string } | null = null;
  if (balanceSource === "safecoin") {
    const charge = await chargeAutoSetup({
      orgId: org.id,
      userId: session.userId,
      routerId,
      supportsContainers: opts.supportsContainers,
    });
    if ("error" in charge && charge.error === "INSUFFICIENT_BALANCE") {
      client.close();
      return {
        error: "Le débit Safecoin n'a pas pu être confirmé. Rechargez le compte puis réessayez.",
        paywall: true as const,
        requiredScCents: safecoinRequiredScCents,
        walletBalanceCents: 0,
      };
    }
    safecoinCharge = "entryId" in charge
      ? { created: charge.created, entryId: charge.entryId }
      : null;
  }

  const log: string[] = [];
  const run = async (words: string[], label: string, timeoutMs?: number) => {
    try {
      await client.talk(words, timeoutMs);
      log.push(`OK: ${label}`);
      return { ok: true } as const;
    } catch (err) {
      const error = err instanceof Error ? err.message : "error";
      log.push(`FAIL (${label}): ${error}`);
      return { ok: false, error } as const;
    }
  };

  // Mandatory firmware update check, run first and over this same API
  // connection (not blind inside the one-shot VPN bootstrap script) so
  // SafeLinkHub can actually see and report what happened. check-for-updates
  // populates installed-version/latest-version; install only fires
  // (downloading the matching version of every currently-installed package
  // — routeros, container, wifi-qcom, zerotier, etc. — and rebooting to
  // apply it) when they differ. The reboot drops this connection, so the
  // rest of provisioning can't continue this run — surfaced as its own
  // result rather than mixed into the step log, so the wizard can tell the
  // admin to simply retry once the router is back online.
  try {
    await client.talk(["/system/package/update/check-for-updates"]).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const [updateStatus] = await client.talk(["/system/package/update/print"]).catch(() => []);
    const installedVersion = updateStatus?.["installed-version"];
    const latestVersion = updateStatus?.["latest-version"];
    if (installedVersion && latestVersion && installedVersion !== latestVersion) {
      await client.talk(["/system/package/update/install"]).catch(() => {});
      client.close();
      return {
        firmwareUpdating: true as const,
        message: `Mise à jour RouterOS ${installedVersion} → ${latestVersion} en cours — le routeur redémarre. Relancez l'auto-setup une fois qu'il est de nouveau accessible.`,
      };
    }
  } catch {
    // Best-effort: an update-check failure (e.g. no internet on the
    // router's WAN yet) shouldn't block the rest of provisioning.
  }

  try {
    // Permanent WAN port rename, with real visibility in the log instead of
    // a silent fire-and-forget — if neither E1-WAN-FAI nor ether1 exist,
    // every NAT/firewall rule below that targets the WAN interface by name
    // would otherwise silently do nothing and there'd be no clue why.
    const alreadyRenamed = await client
      .talk(["/interface/ethernet/print", `?name=${WAN_INTERFACE_NAME}`])
      .catch(() => []);
    if (alreadyRenamed.length > 0) {
      log.push(`OK: WAN port already named ${WAN_INTERFACE_NAME}`);
    } else {
      const ether1 = await client.talk(["/interface/ethernet/print", "?name=ether1"]).catch(() => []);
      if (ether1.length > 0 && ether1[0][".id"]) {
        // Resolve the real .id instead of passing the name itself as
        // "numbers" — that convenience works for objects this script
        // creates fresh (bridges, veth), but /interface/ethernet/set acts
        // on fixed physical ports, where RouterOS expects the internal id
        // (e.g. "*1"), not the name string. Passing the name there was
        // silently failing on at least one hAP ax³ unit, leaving the WAN
        // port named "ether1" with no error surfaced anywhere.
        await run(
          ["/interface/ethernet/set", `=numbers=${ether1[0][".id"]}`, `=name=${WAN_INTERFACE_NAME}`],
          `rename ether1 to ${WAN_INTERFACE_NAME}`,
        );
      } else {
        log.push(
          `SKIP (WAN port rename): neither ether1 nor ${WAN_INTERFACE_NAME} found on this router — check which port is actually the WAN uplink.`,
        );
      }
    }

    // WiFi SSID on every radio the board actually has (hAP ax² has two —
    // 2.4GHz and 5GHz — single-band boards or CCRs with none just see no
    // matching rows and skip silently). Setting the same SSID twice is a
    // harmless no-op, so this runs unconditionally rather than checking
    // first.
    if (opts.ssid?.trim()) {
      // "United States" is RouterOS's widest-permissive regulatory domain
      // (broadest channel/frequency set), used as the default so the
      // auto-channel selection has the most room to find a valid one —
      // not a claim about the router's actual physical operating country.
      const country = opts.wifiCountry?.trim() || "United States";
      const wifiInterfaces = await client.talk(["/interface/wifi/print"]).catch(() => []);
      // Band is read from what each radio actually supports
      // (/interface/wifi/radio reports e.g. "2ghz-g:…,2ghz-ax:…" and names
      // the interface it backs), not from the wifi1/wifi2 naming convention:
      // dual-radio ax boards (hAP ax², ax³) do map wifi1 to the 5GHz radio,
      // but on a single-radio board (hAP ax lite, confirmed live on a real
      // unit) wifi1 is the 2.4GHz radio — asking it for 5ghz-ax made
      // RouterOS reject the whole atomic /interface/wifi/set, so the SSID
      // silently never applied there.
      const wifiRadios = await client.talk(["/interface/wifi/radio/print"]).catch(() => []);
      for (const wifi of wifiInterfaces) {
        if (!wifi.name) continue;
        const radio = wifiRadios.find(
          (r) => r.interface === wifi.name || r.interface === wifi["default-name"],
        );
        // Fallback when the radio row can't be read: wifi1 only means 5GHz
        // when a second radio exists; a lone radio is assumed 2.4GHz.
        const use5ghz = radio
          ? (radio.bands ?? "").includes("5ghz")
          : (wifi["default-name"] === "wifi1" || wifi.name === "wifi1") && wifiInterfaces.length > 1;
        await run(
          [
            "/interface/wifi/set",
            `=numbers=${wifi.name}`,
            `=channel.band=${use5ghz ? "5ghz-ax" : "2ghz-ax"}`,
            // No explicit channel.frequency: RouterOS auto-selects a valid
            // channel within whatever band/country is set above. An
            // earlier version hardcoded "2300-75000" here, which isn't a
            // valid frequency range for either band (2.4GHz tops out
            // around 2484 MHz, 5GHz around 5825 MHz) — RouterOS rejected
            // the whole /interface/wifi/set command because of it, so
            // band/width/country/ssid/disabled=no silently never applied
            // either (it's one atomic command), leaving the radio in
            // whatever state it was already in. That's almost certainly
            // why WiFi looked dead even though the script reported success.
            "=channel.skip-dfs-channels=all",
            `=channel.width=${use5ghz ? "20/40/80mhz" : "20/40mhz"}`,
            `=configuration.country=${country}`,
            "=configuration.mode=ap",
            `=configuration.ssid=${opts.ssid.trim()}`,
            "=disabled=no",
          ],
          `WiFi SSID on ${wifi.name}`,
        );
      }
    }

    // SAFELINKHUB-BRIDGE across every ethernet port that isn't the WAN uplink,
    // plus every WiFi radio (wifi1/wifi2) — without the radios in the
    // bridge, WiFi clients never enter the hotspot's L2 domain at all, so
    // the hotspot service never sees their traffic and the captive portal
    // never shows up. Works the same whether the board has 5 ports (hAP ax
    // lite) or 10+ (ax2) instead of hardcoding a port count.
    // Idempotent on purpose: deleting and recreating this bridge on every
    // run orphans the bridge-port row of any port that was already a
    // member (its master interface vanishes mid-flight) — RouterOS then
    // shows that port's bridge as "unknown" in WinBox, and the move-vs-add
    // logic below couldn't reliably recover it (re-running the wizard a
    // second time left ether2/ether3 stuck on "unknown" while freshly
    // attached ports were fine). Only create it the first time.
    const existingHotspotBridge = await client
      .talk(["/interface/bridge/print", `?name=${bridgeName}`])
      .catch(() => []);
    if (existingHotspotBridge.length > 0) {
      log.push(`OK: ${bridgeName} bridge already exists`);
    } else if (previousBridgeName !== bridgeName) {
      // Admin renamed the bridge from a previous run — rename the live
      // RouterOS object in place (keeps its ports/IP attached) instead of
      // creating a second bridge and orphaning the old one.
      const oldBridge = await client
        .talk(["/interface/bridge/print", `?name=${previousBridgeName}`])
        .catch(() => []);
      if (oldBridge.length > 0 && oldBridge[0][".id"]) {
        await run(
          ["/interface/bridge/set", `=numbers=${oldBridge[0][".id"]}`, `=name=${bridgeName}`],
          `rename ${previousBridgeName} bridge to ${bridgeName}`,
        );
      } else {
        await run(["/interface/bridge/add", `=name=${bridgeName}`], `${bridgeName} bridge`);
      }
    } else {
      await run(["/interface/bridge/add", `=name=${bridgeName}`], `${bridgeName} bridge`);
    }

    const ethernetRows = await client.talk(["/interface/ethernet/print"]).catch(() => []);
    const wifiRows = await client.talk(["/interface/wifi/print"]).catch(() => []);
    const lanPorts = [
      ...ethernetRows.map((r) => r.name),
      ...wifiRows.map((r) => r.name),
    ].filter((name): name is string => Boolean(name) && name !== WAN_INTERFACE_NAME);

    // Routers ship from the factory with ether2..etherN already slaved to a
    // default bridge (commonly "bridge" or "bridge1", with its own DHCP
    // server on 192.168.88.1) — a physical/WiFi interface can only ever be
    // a port of ONE bridge at a time, so blindly /add-ing it to our bridge
    // fails with "already has a master interface" while it's still slaved
    // to that default one. Removes any existing bridge-port row first
    // (whatever bridge it currently points at, including a stale/orphaned
    // one) then adds a fresh one, instead of falling back to add only when
    // no row exists at all.
    for (const port of lanPorts) {
      const existingPort = await client
        .talk(["/interface/bridge/port/print", `?interface=${port}`])
        .catch(() => []);
      if (existingPort.length > 0 && existingPort[0].bridge === bridgeName) {
        continue; // already correctly attached from a previous run
      }
      if (existingPort.length > 0) {
        // Remove the stale row first instead of /set-ing its bridge field
        // in place. Covers both the factory-default case (bridge="bridge")
        // and the orphaned case left by an earlier buggy run that deleted
        // the bridge this row pointed at (bridge comes back empty/unknown)
        // — /set against an orphaned master silently no-ops on at least
        // one RouterOS build, leaving the port shown as "unknown" even
        // though this script reported success. Remove+add is the only
        // path that reliably produces a valid row either way.
        await client
          .talk(["/interface/bridge/port/remove", `=numbers=${existingPort[0][".id"]}`])
          .catch(() => {});
      }
      await run(
        ["/interface/bridge/port/add", `=bridge=${bridgeName}`, `=interface=${port}`],
        existingPort.length > 0
          ? `move ${port} from ${existingPort[0].bridge || "an orphaned bridge reference"} to ${bridgeName} bridge`
          : `attach ${port} to ${bridgeName} bridge`,
      );
    }

    // Every port that was on a legacy/custom bridge name has just been
    // moved off it by the migration loop above — the shell bridge itself
    // is now empty and safe to remove instead of lingering as orphaned
    // clutter.
    // RouterOS refuses to remove a bridge that still has an IP address
    // assigned, so strip any leftover addresses off the stale bridges
    // first — otherwise the remove silently fails and the old bridge
    // lingers next to the new one as a duplicate.
    for (const staleBridgeName of new Set(
      [previousBridgeName, LEGACY_HOTSPOT_BRIDGE_NAME].filter((n) => n !== bridgeName),
    )) {
      const staleAddresses = await client
        .talk(["/ip/address/print", `?interface=${staleBridgeName}`])
        .catch(() => []);
      for (const row of staleAddresses) {
        if (row[".id"]) {
          await client.talk(["/ip/address/remove", `=numbers=${row[".id"]}`]).catch(() => {});
        }
      }
      await client.talk(["/interface/bridge/remove", `=numbers=${staleBridgeName}`]).catch(() => {});
    }

    // Interface lists (WAN / LAN) used for NAT/firewall scoping.
    await run(["/interface/list/add", "=name=WAN"], "WAN interface list");
    await run(["/interface/list/add", "=name=LAN"], "LAN interface list");
    await run(
      ["/interface/list/member/add", `=interface=${WAN_INTERFACE_NAME}`, "=list=WAN"],
      "WAN list member",
    );
    await run(
      ["/interface/list/member/add", `=interface=${bridgeName}`, "=list=LAN"],
      "LAN list member",
    );

    // =numbers= only resolves to a real .id for menus where RouterOS
    // exposes a unique "name"-like property (bridges, schedulers, ...) —
    // /ip/address has no such property, so passing the address string
    // itself here silently matched nothing and this remove was a no-op on
    // every run (caught by .catch and never surfaced). Removes every
    // address currently on the HOTSPOT bridge (not just one matching the
    // exact new value) so changing the hotspot IP between runs actually
    // replaces it instead of leaving the old one assigned alongside the
    // new one — resolving each row's real .id first, same fix pattern as
    // the WAN port rename above.
    const existingHotspotAddresses = await client
      .talk(["/ip/address/print", `?interface=${bridgeName}`])
      .catch(() => []);
    for (const row of existingHotspotAddresses) {
      if (row[".id"]) {
        await client.talk(["/ip/address/remove", `=numbers=${row[".id"]}`]).catch(() => {});
      }
    }
    await run(
      [
        "/ip/address/add",
        `=address=${opts.hotspotAddress}/${opts.hotspotPrefixBits}`,
        `=interface=${bridgeName}`,
        `=network=${subnet.networkAddress}`,
      ],
      "hotspot gateway address",
    );

    await client.talk(["/ip/pool/remove", `=numbers=${HOTSPOT_POOL_NAME}`]).catch(() => {});
    await run(
      [
        "/ip/pool/add",
        `=name=${HOTSPOT_POOL_NAME}`,
        // Pool starts one address after the gateway so the gateway itself
        // never gets handed out to a client.
        `=ranges=${poolRangeExcludingGateway(opts.hotspotAddress, subnet)}`,
      ],
      "hotspot DHCP pool",
    );

    // Cleans up the pool RouterOS's own Hotspot Setup wizard names after
    // the bridge ("<bridge>-pool") and the one left from the pre-rename
    // "HOTSPOT" topology — neither is HOTSPOT_POOL_NAME, so the
    // unconditional remove above never touched them. Harmless clutter
    // once the hotspot server is repointed at POOL-HOTSPOT (done above
    // this run), but still visible as a confusing leftover in WinBox
    // until explicitly removed.
    for (const legacyPoolName of [`${LEGACY_HOTSPOT_BRIDGE_NAME}-pool`, `${bridgeName}-pool`]) {
      if (legacyPoolName === HOTSPOT_POOL_NAME) continue;
      await client.talk(["/ip/pool/remove", `=numbers=${legacyPoolName}`]).catch(() => {});
    }

    await client.talk(["/ip/dhcp-server/remove", "=numbers=dhcp1"]).catch(() => {});
    await run(
      [
        "/ip/dhcp-server/add",
        `=address-pool=${HOTSPOT_POOL_NAME}`,
        `=interface=${bridgeName}`,
        "=name=dhcp1",
        "=lease-time=00:30:00",
      ],
      "hotspot DHCP server",
    );
    await run(
      [
        "/ip/dhcp-server/network/add",
        `=address=${subnet.networkAddress}/${opts.hotspotPrefixBits}`,
        `=dns-server=${opts.hotspotAddress},1.1.1.1`,
        `=gateway=${opts.hotspotAddress}`,
        `=netmask=${opts.hotspotPrefixBits}`,
      ],
      "hotspot DHCP network",
    );

    // Edit-in-place instead of remove-then-add for both the profile and
    // the server. Matched by the bridge INTERFACE actually in use, not by
    // the expected name — a server/profile surviving from an older run
    // (different bridge/hotspot name, or RouterOS's own Quick Set
    // defaults) is still the *same logical hotspot service* on this
    // router and must be the one edited, not left alone while a second
    // server+profile pair gets created next to it. Matching by name alone
    // missed that old pair entirely: nothing matched "hotspot1" by name,
    // so a new server/profile got added, the ADD silently failed because
    // RouterOS already had a (disabled, oddly-named) server bound to this
    // same interface, and the cleanup pass below couldn't remove the old
    // profile either since that still-alive old server was still
    // referencing it — net effect, two profiles and a disabled server
    // stuck under its previous name.
    const htmlDirectory = opts.htmlDirectory?.trim() || "hotspot";
    const existingHotspotServers = await client.talk(["/ip/hotspot/print"]).catch(() => []);
    const matchingServer =
      existingHotspotServers.find((s) => s.interface === bridgeName) ?? existingHotspotServers[0];

    const existingProfiles = await client.talk(["/ip/hotspot/profile/print"]).catch(() => []);
    const matchingProfile =
      existingProfiles.find((p) => p.name === matchingServer?.profile) ??
      existingProfiles.find((p) => p.name === hotspotProfileName);

    // If some OTHER profile already has the target name (e.g. an orphan
    // left over from manual WinBox experimentation, unrelated to the
    // live server), remove it first — renaming matchingProfile to that
    // same name via /set below would otherwise collide with it (RouterOS
    // enforces unique profile names) and fail silently.
    const conflictingProfile = existingProfiles.find(
      (p) => p.name === hotspotProfileName && p[".id"] !== matchingProfile?.[".id"],
    );
    if (conflictingProfile?.[".id"]) {
      await client
        .talk(["/ip/hotspot/profile/remove", `=numbers=${conflictingProfile[".id"]}`])
        .catch(() => {});
    }

    const profileFields = [
      `=name=${hotspotProfileName}`,
      `=hotspot-address=${opts.hotspotAddress}`,
      `=dns-name=${opts.dnsName}`,
      `=html-directory=${htmlDirectory}`,
      `=html-directory-override=${htmlDirectory}`,
      "=http-cookie-lifetime=52w1d",
      "=install-hotspot-queue=yes",
      // Login par code (http-chap/http-pap) + cookie navigateur et MAC cookie.
      // `mac-cookie` ne donne pas accès avec la seule MAC : il mémorise les
      // identifiants après un premier login valide, afin que l'appareil se
      // reconnecte automatiquement pendant la durée de son ticket. On n'ajoute
      // volontairement PAS `mac`, qui authentifierait une MAC sans ticket.
      "=login-by=cookie,http-chap,http-pap,mac-cookie",
    ];
    if (matchingProfile?.[".id"]) {
      await run(
        ["/ip/hotspot/profile/set", `=numbers=${matchingProfile[".id"]}`, ...profileFields],
        "hotspot profile",
      );
    } else {
      await run(["/ip/hotspot/profile/add", ...profileFields], "hotspot profile");
    }

    const serverFields = [
      `=address-pool=${HOTSPOT_POOL_NAME}`,
      "=addresses-per-mac=1",
      "=disabled=no",
      `=interface=${bridgeName}`,
      `=name=${serverName}`,
      `=profile=${hotspotProfileName}`,
    ];
    if (matchingServer?.[".id"]) {
      await run(
        ["/ip/hotspot/set", `=numbers=${matchingServer[".id"]}`, ...serverFields],
        "hotspot service",
      );
    } else {
      await run(["/ip/hotspot/add", ...serverFields], "hotspot service");
    }

    const configuredHotspotServers = await client.talk(["/ip/hotspot/print", `?name=${serverName}`]).catch(() => []);
    const configuredServer =
      configuredHotspotServers.find((s) => s.interface === bridgeName) ?? configuredHotspotServers[0];
    if (configuredServer?.[".id"] && configuredServer?.["address-pool"] !== HOTSPOT_POOL_NAME) {
      await run(
        ["/ip/hotspot/set", `=numbers=${configuredServer[".id"]}`, `=address-pool=${HOTSPOT_POOL_NAME}`],
        "repaired hotspot server address pool",
      );
    }

    // Now safe to clean up any leftover servers/profiles, using a fresh
    // read after RouterOS has applied the authoritative hotspot1 set/add.
    // The previous cleanup iterated the pre-set snapshot, so a stale
    // legacy-named row could survive beside the correct hotspot1 row
    // after RouterOS normalized names/interfaces.
    const finalHotspotServers = await client.talk(["/ip/hotspot/print"]).catch(() => []);
    for (const server of finalHotspotServers) {
      if (server[".id"] && server[".id"] !== configuredServer?.[".id"]) {
        await client.talk(["/ip/hotspot/remove", `=numbers=${server[".id"]}`]).catch(() => {});
        log.push(`OK: removed duplicate hotspot server ${server.name || server[".id"]}`);
      }
    }

    const finalProfiles = await client.talk(["/ip/hotspot/profile/print"]).catch(() => []);
    const activeProfileName = configuredServer?.profile || hotspotProfileName;
    for (const profile of finalProfiles) {
      if (profile[".id"] && profile.name !== "default" && profile.name !== activeProfileName) {
        await client
          .talk(["/ip/hotspot/profile/remove", `=numbers=${profile[".id"]}`])
          .catch(() => {});
        log.push(`OK: removed duplicate hotspot profile ${profile.name || profile[".id"]}`);
      }
    }

    // Optional, operator-chosen default hotspot users (e.g. a quick test
    // login) — opt-in per router rather than a fixed multi-tenant default.
    // RouterOS Hotspot login expects a password unless MAC login handles the
    // user; for deterministic client installs, the password is always the
    // same value as the username and existing users are reconciled.
    for (const entry of opts.defaultHotspotUsers ?? []) {
      const name = (typeof entry === "string" ? entry : entry.name).trim();
      if (!name) continue;
      // Chaîne → mot de passe = login ; objet → mot de passe distinct si fourni.
      const password = typeof entry === "string" ? name : entry.password?.trim() || name;
      const existingUser = await client.talk(["/ip/hotspot/user/print", `?name=${name}`]).catch(() => []);
      if (existingUser.length === 0) {
        await run(
          ["/ip/hotspot/user/add", `=name=${name}`, `=password=${password}`],
          `hotspot user ${name}`,
        );
      } else if (existingUser[0][".id"]) {
        await run(
          ["/ip/hotspot/user/set", `=numbers=${existingUser[0][".id"]}`, `=password=${password}`],
          `hotspot user ${name} password`,
        );
      }
    }

    // Captive portal: pushes the bundled hotspot-sfh1 (SafeLinkHub)
    // multi-file hotspot portal onto the html-directory the profile above
    // just pointed at, the same way a manual "Importer le portail
    // hotspot-sfh1" + "assign to bridge" would (see
    // captive-templates/actions.ts) — except this runs
    // as part of the one-click auto-setup, so RouterOS never falls back to
    // its bare factory-default login page. Reuses the org's existing
    // "package" template if one was already created (so customized support
    // contacts/vendors — see PackageBrandingEditor — survive a re-run);
    // creates the bundled default only if none exists yet.
    if (opts.installCaptivePortal === false) {
      log.push("SKIP (captive portal): désactivé pour cette exécution — page de connexion par défaut RouterOS conservée.");
    } else {
      try {
        let packageTemplate: typeof captiveTemplates.$inferSelect | undefined;

        if (opts.captiveTemplateId) {
          [packageTemplate] = await db
            .select()
            .from(captiveTemplates)
            .where(
              and(
                eq(captiveTemplates.id, opts.captiveTemplateId),
                eq(captiveTemplates.orgId, router.orgId),
                eq(captiveTemplates.templateType, "package"),
              ),
            )
            .limit(1);
        }

        if (!packageTemplate) {
          const [assignedHotspotBridge] = await db
            .select({ captiveTemplateId: bridges.captiveTemplateId })
            .from(bridges)
            .where(and(eq(bridges.routerId, routerId), eq(bridges.hotspotEnabled, true)))
            .limit(1);

          if (assignedHotspotBridge?.captiveTemplateId) {
            [packageTemplate] = await db
              .select()
              .from(captiveTemplates)
              .where(
                and(
                  eq(captiveTemplates.id, assignedHotspotBridge.captiveTemplateId),
                  eq(captiveTemplates.orgId, router.orgId),
                  eq(captiveTemplates.templateType, "package"),
                ),
              )
              .limit(1);
          }
        }

        if (!packageTemplate) {
          [packageTemplate] = await db
            .select()
            .from(captiveTemplates)
            .where(
              and(
                eq(captiveTemplates.orgId, router.orgId),
                eq(captiveTemplates.templateType, "package"),
                eq(captiveTemplates.isDefault, true),
              ),
            )
            .limit(1);
        }

        if (!packageTemplate) {
          [packageTemplate] = await db
            .select()
            .from(captiveTemplates)
            .where(and(eq(captiveTemplates.orgId, router.orgId), eq(captiveTemplates.templateType, "package")))
            .limit(1);
        }

        if (!packageTemplate) {
          // Auto-seeds the SaaS DEFAULT bundled portal ("SafeLink Baraka"),
          // suffixed with the client's own WiFi (SSID) when known so an admin
          // with more than one hotspot can still tell which portail belongs to
          // which. Baraka affiche les forfaits/prix EN DIRECT (renderInlinePlans
          // + endpoint /plans) et intègre le paiement — tout nouveau routeur
          // configuré obtient donc prix à jour + achat sans réglage manuel.
          const templateName = opts.ssid?.trim()
            ? `SafeLink Baraka — ${opts.ssid.trim()}`
            : "SafeLink Baraka";
          [packageTemplate] = await db
            .insert(captiveTemplates)
            .values({
              orgId: router.orgId,
              name: templateName,
              isDefault: false,
              templateType: "package",
              packageFiles: loadSafelinkBarakaPackage(),
            })
            .returning();
        }

        const files = (packageTemplate.packageFiles as PackageFile[] | null) ?? [];
        const [org] = await db
          .select({ slug: organizations.slug })
          .from(organizations)
          .where(eq(organizations.id, router.orgId))
          .limit(1);

        if (files.length === 0 || !org) {
          log.push("SKIP (captive portal): template ou organisation introuvable.");
        } else {
          const appUrl = getAppUrl();
          const fileBaseUrl = `${appUrl}/api/router/v1/${org.slug}/captive-template/${packageTemplate.id}`;
          const uploadResult = await uploadCaptiveTemplatePackage(client, {
            files,
            htmlDirectory,
            fileBaseUrl,
            ssid: opts.ssid?.trim() || opts.hotspotName,
            routerId: router.id,
          });
          if (uploadResult.failed.length > 0) {
            log.push(
              `SKIP (captive portal): ${uploadResult.failed.length}/${files.length} fichiers n'ont pas pu être envoyés (${uploadResult.failed.map((f) => `${f.path}: ${f.error}`).join("; ")}).`,
            );
          } else {
            log.push(`OK: portail captif SafeLinkHub installé (${uploadResult.uploaded.length} fichiers)`);
          }
        }
      } catch (err) {
        log.push(
          `SKIP (captive portal): ${err instanceof Error ? err.message : "erreur inconnue"}`,
        );
      }
    }

    // Walled-garden du hotspot (app SafeLinkHub + rails de paiement, tables
    // L7 ET walled-garden ip pour l'HTTPS pré-auth) — installé DÈS
    // l'auto-setup pour que le paiement du portail marche immédiatement,
    // sans attendre le premier health-check (reconcileWalledGardenOnce le
    // maintient ensuite à jour à chaque sync). Best-effort : un échec ici ne
    // bloque pas la provision, le sync suivant rattrape.
    try {
      const { added } = await ensureWalledGarden(
        client,
        new URL(getAppUrl()).host,
        await getOrgWalledGardenDisabledHosts(router.orgId),
      );
      log.push(`OK: walled-garden installé (${added.length} hôtes joignables avant connexion).`);
    } catch (err) {
      log.push(
        `SKIP (walled-garden): ${err instanceof Error ? err.message : "erreur inconnue"} — sera réconcilié au prochain health-check.`,
      );
    }

    // ddns-enabled gives the router a reachable hostname even behind CGNAT;
    // dns-name on the hotspot profile is the captive-portal domain.
    await run(["/ip/cloud/set", "=ddns-enabled=yes"], "IP cloud DDNS");
    // Factory-default RouterOS config commonly already runs a DHCP client
    // on the WAN port for plug-and-play internet — RouterOS only allows one
    // per interface, so adding a second one errors. Skip if one's already
    // there (it keeps working fine after the ether1 -> E1-WAN-FAI rename).
    const existingDhcpClient = await client
      .talk(["/ip/dhcp-client/print", `?interface=${WAN_INTERFACE_NAME}`])
      .catch(() => []);
    if (existingDhcpClient.length === 0) {
      await run(
        ["/ip/dhcp-client/add", `=interface=${WAN_INTERFACE_NAME}`, "=name=client1"],
        "WAN DHCP client",
      );
    }
    await run(
      ["/ip/dns/set", "=allow-remote-requests=yes", "=servers=208.67.222.222,8.8.8.8"],
      "DNS resolver",
    );

    // WAN masquerade is needed regardless of container support. RouterOS
    // ships with this exact rule already in place out of the box (out-
    // interface=ether1, no comment) — it auto-follows the WAN rename above,
    // so without this check every re-run added an indistinguishable
    // duplicate on top of it.
    const existingWanMasquerade = await client
      .talk(["/ip/firewall/nat/print", "?chain=srcnat", "?action=masquerade", `?out-interface=${WAN_INTERFACE_NAME}`])
      .catch(() => []);
    if (existingWanMasquerade.length === 0) {
      await run(
        ["/ip/firewall/nat/add", "=chain=srcnat", `=out-interface=${WAN_INTERFACE_NAME}`, "=action=masquerade"],
        "WAN masquerade",
      );
    }

    // Safety net: if the WAN rename above couldn't run (ether1 missing/
    // already something else) but a literal "ether1" interface still
    // exists and actually carries the WAN connection, make sure it's
    // masqueraded too — otherwise a failed rename silently leaves that
    // port with no internet sharing at all.
    const literalEther1 = await client.talk(["/interface/ethernet/print", "?name=ether1"]).catch(() => []);
    if (literalEther1.length > 0) {
      const existingEther1Masquerade = await client
        .talk(["/ip/firewall/nat/print", "?chain=srcnat", "?action=masquerade", "?out-interface=ether1"])
        .catch(() => []);
      if (existingEther1Masquerade.length === 0) {
        await run(
          ["/ip/firewall/nat/add", "=chain=srcnat", "=out-interface=ether1", "=action=masquerade"],
          "WAN masquerade (fallback on ether1, rename did not run)",
        );
      }
    }

    const existingHotspotMasquerade = await client
      .talk(["/ip/firewall/nat/print", "?chain=srcnat", "?action=masquerade", "?comment=masquerade hotspot network"])
      .catch(() => []);
    if (existingHotspotMasquerade.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=srcnat",
          "=action=masquerade",
          "=comment=masquerade hotspot network",
          `=src-address=${subnet.networkAddress}/${opts.hotspotPrefixBits}`,
        ],
        "masquerade hotspot network",
      );
    }

    // Placeholder NAT rule reserved for the hotspot service's own auto-managed
    // rules (RouterOS inserts its dynamic hotspot NAT rules right after this
    // passthrough marker) — disabled by default since it does nothing on its
    // own. Le placeholder de FILTER n'est plus créé : à la demande de
    // l'opérateur, l'auto-setup n'ajoute AUCUNE règle firewall filter (voir le
    // bloc de durcissement retiré plus bas).
    const placeholderComment = "place hotspot rules here";
    const existingNatPlaceholder = await client
      .talk(["/ip/firewall/nat/print", `?chain=unused-hs-chain`, `?comment=${placeholderComment}`])
      .catch(() => []);
    if (existingNatPlaceholder.length === 0) {
      await run(
        [
          "/ip/firewall/nat/add",
          "=chain=unused-hs-chain",
          "=action=passthrough",
          `=comment=${placeholderComment}`,
          "=disabled=yes",
        ],
        "firewall NAT placeholder (hotspot rules anchor)",
      );
    }

    // Durcissement firewall FILTER : l'auto-setup n'en AJOUTE aucun ET RETIRE
    // celui hérité (posé par d'anciennes versions, souvent empilé en double au
    // fil des reruns) — « Drop Invalid Connections », la chaîne « block-ddos »
    // (return + add-src/dst + le saut depuis forward + le drop des paires
    // ddoser→ddosed) et « BLOCK DNS ON WAN ». Supprimé à CHAQUE run. On liste
    // puis filtre en JS plutôt que d'utiliser des requêtes API multi-conditions
    // (sémantique AND/OR ambiguë) : on ne retire QUE ces règles, jamais
    // d'autres règles forward. Le durcissement RAW côté WAN ci-dessous
    // (Winbox-only) est conservé — c'est du /ip firewall raw, pas du filter.
    const removeFilterRules = async (rows: Sentence[]) => {
      for (const row of rows) {
        if (row[".id"]) {
          await client
            .talk(["/ip/firewall/filter/remove", `=numbers=${row[".id"]}`])
            .catch(() => {});
        }
      }
    };
    for (const comment of ["Drop Invalid Connections", "BLOCK DNS REQUEST ON WAN INTERFACE"]) {
      const rows = await client
        .talk(["/ip/firewall/filter/print", `?comment=${comment}`])
        .catch(() => [] as Sentence[]);
      await removeFilterRules(rows);
    }
    // Toute la chaîne personnalisée block-ddos (return + add-dst + add-src).
    const ddosChainRows = await client
      .talk(["/ip/firewall/filter/print", "?chain=block-ddos"])
      .catch(() => [] as Sentence[]);
    await removeFilterRules(ddosChainRows);
    // Dans forward : le saut vers block-ddos + le drop des paires ddoser→ddosed.
    const forwardRows = await client
      .talk(["/ip/firewall/filter/print", "?chain=forward"])
      .catch(() => [] as Sentence[]);
    await removeFilterRules(
      forwardRows.filter(
        (r) =>
          r["jump-target"] === "block-ddos" ||
          (r["src-address-list"] === "ddoser" && r["dst-address-list"] === "ddosed"),
      ),
    );

    // Raw firewall on the WAN side: only Winbox stays reachable from the
    // internet; every other management/remote-access port is dropped before
    // connection tracking even sees it. The admin still reaches Winbox/API/
    // WebFig from the LAN or VPN — this only restricts the WAN interface.
    await run(
      ["/ip/firewall/raw/add", "=chain=prerouting", "=in-interface-list=WAN", "=protocol=tcp", "=dst-port=8291", "=action=accept"],
      "raw: allow Winbox from WAN",
    );
    const wanBlockedTcpPorts = [8728, 22, 21, 23, 80, 443, 8080, 8729, DOCKER_WEB_PORT, TUNNEL_ACCESS_PORT];
    for (const port of wanBlockedTcpPorts) {
      await run(
        ["/ip/firewall/raw/add", "=chain=prerouting", "=in-interface-list=WAN", "=protocol=tcp", `=dst-port=${port}`, "=action=drop"],
        `raw: drop WAN tcp/${port}`,
      );
    }
    for (const port of [53, 162, 161]) {
      await run(
        ["/ip/firewall/raw/add", "=chain=prerouting", "=in-interface-list=WAN", "=protocol=udp", `=dst-port=${port}`, "=action=drop"],
        `raw: drop WAN udp/${port}`,
      );
    }

    const containerSetup = await provisionDockerStack(client, log, run, {
      supportsContainers: opts.supportsContainers,
      hasUsbStorage: opts.hasUsbStorage,
      hasLargeOnboardStorage: opts.hasLargeOnboardStorage,
      hasEmmcStorage: opts.hasEmmcStorage,
      hotspotAddress: opts.hotspotAddress,
      // Auto-remplissage de la « Paramètres de session » MikHmon : IP = passerelle
      // du veth (11.11.11.1, ce que le conteneur utilise pour joindre l'API),
      // identifiants = compte API du routeur, reste dérivé du hotspot.
      mikhmonSession:
        router.username && router.passwordEncrypted
          ? {
              name: "Safelink",
              mtIp: VETH_GATEWAY,
              mtUser: router.username,
              mtPass: decryptSecret(router.passwordEncrypted),
              hotspotName: opts.hotspotName,
              dnsName: opts.dnsName?.trim() || opts.hotspotAddress,
              currency: "fcfa",
            }
          : undefined,
    });

    if (
      opts.supportsContainers &&
      (containerSetup.status === "failed" || containerSetup.status === "skipped")
    ) {
      return {
        error: `MikHmon n'a pas pu être installé : ${containerSetup.message ?? "le routeur a refusé une commande de conteneur."}`,
        log,
      };
    }

    // Le conteneur MikHmon est en place ET la session a été pré-écrite (config.php)
    // → on horodate pour le contrôle « Session MikHmon » du Diagnostic (le fichier
    // interne du conteneur n'étant pas énumérable via l'API RouterOS).
    if (
      opts.supportsContainers &&
      containerSetup.status !== "failed" &&
      containerSetup.status !== "skipped" &&
      router.username &&
      router.passwordEncrypted
    ) {
      await getDb()
        .update(routers)
        .set({ mikhmonSessionAt: new Date() })
        .where(eq(routers.id, router.id))
        .catch(() => {});
    }


    // Lock down unused management services. Winbox (8291), WebFig (www —
    // moved to :85 below) and the API stay enabled and reachable: the admin
    // added this router through one of those three (Winbox, the API
    // directly, or WebFig) and the auto-setup must not lock that access out.
    await run(["/ip/service/set", "=numbers=telnet", "=disabled=yes"], "disable telnet");
    await run(["/ip/service/set", "=numbers=api-ssl", "=disabled=yes"], "disable api-ssl");
    // The FTP *service* (interactive login) stays off — safelinkhub-group
    // now has the "ftp" *policy* bit (needed for /tool fetch writes, see
    // above), which would otherwise also re-permit logging into this
    // service with that account. /tool fetch doesn't go through this
    // service at all, so disabling it doesn't affect the captive portal.
    await run(["/ip/service/set", "=numbers=ftp", "=disabled=yes"], "disable ftp service (policy bit needed for /tool fetch only)");
    // www (WebFig) moves off :80 — the hotspot needs that port to intercept
    // unauthenticated clients and show the captive portal — but stays
    // enabled at :85 instead of being disabled, so WebFig keeps working.
    await run(["/ip/service/set", "=numbers=www", "=port=85"], "WebFig moved to port 85 (kept enabled)");

    // The plain "api" service (what this very script is running over) is
    // scoped to wherever the admin is actually managing this router from,
    // matching install-vpn/install-openvpn's own restriction — never widen
    // it beyond that plus the Docker subnet, and never disable it, since
    // that would cut off SafeLinkHub itself. The Docker subnet has to stay
    // in this allowlist too: MikHmon (running inside the container at
    // 11.11.11.11) connects to the router's own API at the DOCKER-SAFELINKHUB bridge
    // gateway (11.11.11.1) to manage hotspot users/vouchers — without
    // DOCKER_NETWORK here, that connection gets silently rejected by the
    // api service itself and MikHmon's "Paramètres de session" page shows
    // "MikroTik Not Connected" even with the correct IP/credentials typed in.
    // ssh used to be unconditionally disabled here as a hardening step —
    // but SFTP (what FileZilla and similar tools use) rides on that same
    // ssh service, so disabling it meant FileZilla could never connect
    // even over a working personal VPN, regardless of the separate
    // "Activer l'accès direct SSH" relay forward (port-forward.ts's
    // setSshServiceEnabled only flips this same flag on toggle — most
    // admins reasonably expect VPN access alone to be enough). Scoped to
    // the tunnel subnet instead, the same way the api service already is
    // below: reachable over the private VPN, never from the public WAN.
    if (router.connectionMethod === "vpn") {
      await run(
        ["/ip/service/set", "=numbers=api", `=address=10.66.0.0/24,${DOCKER_NETWORK}`],
        "scope API to WireGuard tunnel subnet + Docker (MikHmon)",
      );
      await run(
        ["/ip/service/set", "=numbers=ssh", "=disabled=no", "=address=10.66.0.0/24"],
        "scope SSH/SFTP (FileZilla) to WireGuard tunnel subnet",
      );
    } else if (router.connectionMethod === "openvpn") {
      await run(
        ["/ip/service/set", "=numbers=api", `=address=10.67.0.0/24,${DOCKER_NETWORK}`],
        "scope API to OpenVPN tunnel subnet + Docker (MikHmon)",
      );
      await run(
        ["/ip/service/set", "=numbers=ssh", "=disabled=no", "=address=10.67.0.0/24"],
        "scope SSH/SFTP (FileZilla) to OpenVPN tunnel subnet",
      );
    } else {
      log.push("OK: API service left open on its current address (direct LAN connection) — Winbox/WebFig/API all unaffected");
      await run(["/ip/service/set", "=numbers=ssh", "=disabled=yes"], "disable ssh (direct LAN connection, no VPN tunnel to scope it to)");
    }
    if (router.connectionMethod === "vpn" || router.connectionMethod === "openvpn") {
      await ensureSshTunnelAccess(client, log, router.username ?? undefined);
    }

    await run(["/system/clock/set", "=time-zone-name=Africa/Abidjan"], "timezone Africa/Abidjan");
    await run(["/ip/cloud/set", "=ddns-enabled=yes", "=update-time=yes"], "MikroTik Cloud DDNS/time enabled");

    const identityName =
      opts.identity?.trim() || `HSPT-${opts.hotspotName.split(/[\s-]/)[0].toUpperCase()}`;
    await run(["/system/identity/set", `=name=${identityName}`], "system identity");

    await run(["/system/ntp/client/set", "=enabled=yes"], "NTP client enabled");
    for (const server of NTP_SERVERS) {
      const existingServers = await client
        .talk(["/system/ntp/client/servers/print", `?address=${server}`])
        .catch(() => [] as Sentence[]);
      for (const row of existingServers) {
        if (row[".id"]) {
          await client.talk(["/system/ntp/client/servers/remove", `=numbers=${row[".id"]}`]).catch(() => {});
        }
      }
      await run(["/system/ntp/client/servers/add", `=address=${server}`], `NTP server ${server}`);
    }

    // MikHmon voucher profiles: each profile's on-login script schedules its
    // own one-shot expiry job per user, and a matching always-on scheduler
    // job sweeps anyone whose voucher already expired (covers the case
    // where the router rebooted and lost the one-shot scheduler entries).
    // A profile is UPDATED in place when it already exists: remove + add
    // assigns a new internal RouterOS ID and leaves all existing tickets
    // pointing at the old, now dangling ID (shown as "unknown" in Winbox).
    // The admin picks which durations to offer — including custom ones they
    // defined themselves. Distinguishes "field omitted" (older callers
    // that never offered a choice — fall back to the 6 bundled presets)
    // from "explicitly an empty list" (the wizard's voucher step, where an
    // admin who created zero custom profiles really does mean zero, not
    // "give me the presets I just removed from the UI").
    const wantedProfiles =
      opts.voucherProfiles !== undefined ? opts.voucherProfiles : VOUCHER_PROFILES;
    const existingVoucherProfiles = await client
      .talk(["/ip/hotspot/user/profile/print", "=.proplist=.id,name"], 30000)
      .catch(() => [] as Sentence[]);
    const existingVoucherProfilesByName = new Map(
      existingVoucherProfiles
        .filter((existing) => !!existing.name && !!existing[".id"])
        .map((existing) => [existing.name, existing[".id"]!]),
    );
    for (const profile of wantedProfiles) {
      const profileSettings = [
        `=address-pool=${HOTSPOT_POOL_NAME}`,
        `=on-login=${profile.onLogin}`,
        "=parent-queue=none",
        // Après une authentification par ticket valide, autorise RouterOS à
        // mémoriser le mac-cookie pour la reconnexion automatique.
        "=add-mac-cookie=yes",
        // Débit personnalisé (rx/tx côté client) si l'admin l'a saisi ;
        // sinon la valeur vide efface une ancienne limite et rétablit le
        // débit du lien, comme la création initiale sans rate-limit.
        `=rate-limit=${profile.rateLimit ?? ""}`,
      ];
      const existingId = existingVoucherProfilesByName.get(profile.name);
      await run(
        existingId
          ? ["/ip/hotspot/user/profile/set", `=numbers=${existingId}`, ...profileSettings]
          : ["/ip/hotspot/user/profile/add", `=name=${profile.name}`, ...profileSettings],
        `voucher profile ${profile.name}`,
      );

      await client
        .talk(["/system/scheduler/remove", `=numbers=${profile.name}`])
        .catch(() => {});
      await run(
        [
          "/system/scheduler/add",
          `=name=${profile.name}`,
          `=interval=${profile.monitorInterval}`,
          `=on-event=${profile.monitorOnEvent}`,
          "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
          "=start-date=jan/01/2024",
          "=start-time=00:00:00",
          `=comment=Monitor Profile ${profile.name}`,
        ],
        `expiry sweep scheduler ${profile.name}`,
      );
    }

    // Mirror each custom voucher profile as a sellable "Forfait" on
    // /admin/packages — SCOPÉ AU ROUTEUR courant. Upserté par (orgId,
    // routerId, name) : re-lancer l'auto-setup du MÊME routeur avec le même
    // nom de profil met à jour prix/durée au lieu de dupliquer, et n'affecte
    // PAS les forfaits d'un autre routeur de l'org. Un forfait legacy (routerId
    // null) portant ce nom est ADOPTÉ (routerId renseigné) plutôt que dupliqué
    // → migration douce des orgs mono-routeur au 1er auto-setup. Un prix édité
    // à la main sur la page Forfaits n'est écrasé que si la valeur du wizard
    // change réellement.
    for (const pkg of opts.packagesToSync ?? []) {
      // Ligne déjà rattachée à CE routeur en priorité, sinon une legacy null à
      // adopter (jamais une ligne d'un AUTRE routeur).
      const [existingPackage] = await db
        .select({ id: packages.id, routerId: packages.routerId })
        .from(packages)
        .where(
          and(
            eq(packages.orgId, org.id),
            eq(packages.name, pkg.name),
            or(eq(packages.routerId, routerId), isNull(packages.routerId)),
          ),
        )
        // asc = NULLS LAST en Postgres → la ligne déjà rattachée à CE routeur
        // (routerId non-null) passe avant une legacy null à adopter.
        .orderBy(asc(packages.routerId))
        .limit(1);
      // Débit personnalisé (Mbps) → miroir sur le forfait, seulement si fourni
      // et valide (les deux > 0) ; sinon on ne touche pas au débit existant.
      const bandwidth =
        pkg.uploadMbps && pkg.downloadMbps && pkg.uploadMbps > 0 && pkg.downloadMbps > 0
          ? { uploadMbps: pkg.uploadMbps, downloadMbps: pkg.downloadMbps }
          : {};
      if (existingPackage) {
        await db
          .update(packages)
          .set({
            routerId, // adopte une ligne legacy null au passage
            priceCents: pkg.priceCents,
            durationValue: pkg.durationValue,
            durationUnit: pkg.durationUnit,
            ...bandwidth,
          })
          .where(eq(packages.id, existingPackage.id));
        log.push(`OK: forfait "${pkg.name}" mis à jour sur la page Forfaits.`);
      } else {
        await db.insert(packages).values({
          orgId: org.id,
          routerId,
          name: pkg.name,
          priceCents: pkg.priceCents,
          durationValue: pkg.durationValue,
          durationUnit: pkg.durationUnit,
          ...bandwidth,
        });
        log.push(`OK: forfait "${pkg.name}" créé sur la page Forfaits.`);
      }
    }

    // Le formulaire de l'auto-setup est la SOURCE DE VÉRITÉ des forfaits DE CE
    // ROUTEUR : après avoir upserté la liste saisie, on RETIRE les forfaits
    // rattachés à CE routeur qui n'y sont plus (anciens presets/profils d'un
    // run précédent). Scopé à routerId → ne touche JAMAIS aux forfaits d'un
    // autre MikroTik ni aux legacy null (adoptés ci-dessus s'ils y figurent).
    // Sans ça ils s'empilaient et le portail affichait des doublons (ex.
    // « 07 Jours » ET « 01 Semaine » tous deux à 700 F). Les FK vouchers/
    // portalOrders sont en onDelete:"set null" → aucune violation, les
    // commandes passées restent. On ne prune QUE si une liste EXPLICITE et NON
    // VIDE est fournie : liste absente = ancien appelant (on ne touche à rien) ;
    // liste vide = on ne wipe pas tout par sécurité (le wizard exige ≥1 profil).
    if (opts.packagesToSync && opts.packagesToSync.length > 0) {
      const keepNames = opts.packagesToSync.map((p) => p.name);
      const pruned = await db
        .delete(packages)
        .where(
          and(
            eq(packages.orgId, org.id),
            eq(packages.routerId, routerId),
            notInArray(packages.name, keepNames),
          ),
        )
        .returning({ name: packages.name });
      if (pruned.length > 0) {
        log.push(
          `OK: ${pruned.length} ancien(s) forfait(s) retiré(s) (absents de l'auto-setup) : ${pruned
            .map((p) => p.name)
            .join(", ")}.`,
        );
      }
    }

    // Daily cleanup: drop any leftover one-shot expiry schedulers/scripts
    // whose user has already been removed (e.g. by the sweep above), so the
    // scheduler and script lists don't grow unbounded over time.
    await client.talk(["/system/scheduler/remove", "=numbers=CLEAN_JOB"]).catch(() => {});
    await run(
      [
        "/system/scheduler/add",
        "=name=CLEAN_JOB",
        "=interval=1d",
        '=on-event=/sys sch rem [find where on-event=""];/sys scr job rem [find where owner~"sys"]',
        "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
        "=start-date=jan/01/2024",
        "=start-time=00:00:05",
      ],
      "daily cleanup job (CLEAN_JOB)",
    );

    // Anti connection-sharing TTL rewrite on the hotspot bridge — rewrites
    // every forwarded packet's TTL to 1 past this router, so a client
    // device can't transparently re-share the hotspot connection over its
    // own hotspot/tethering (the chained router would see TTL=0 and the
    // packet would just die instead of reaching the internet).
    const existingMangle = await client
      .talk(["/ip/firewall/mangle/print", `?out-interface=${bridgeName}`, "?action=change-ttl"])
      .catch(() => []);
    if (existingMangle.length === 0) {
      await run(
        [
          "/ip/firewall/mangle/add",
          "=chain=postrouting",
          `=out-interface=${bridgeName}`,
          "=action=change-ttl",
          "=new-ttl=set:1",
          "=passthrough=no",
        ],
        "mangle: anti connection-sharing TTL rewrite",
      );
    }

    // Restricted API user group: scopes whatever account SafeLinkHub
    // connects with to what the app needs (read/write/test/sensitive/api),
    // plus ssh/ftp so the same managed account can authenticate SFTP
    // through the SafeLinkHub tunnel when the admin explicitly enables the
    // SSH/SFTP relay forward. Telnet, WinBox, WebFig, local, reboot,
    // password, sniff, romon and rest-api stay denied.
    //
    // "ftp" is granted, not denied — RouterOS overloads that single policy
    // bit for two unrelated things: (1) logging into the FTP *server*
    // protocol, and (2) writing a file to disk via /tool fetch's dst-path,
    // which the captive-portal install entirely depends on. Denying it
    // here was blocking every single /tool fetch write with "permission
    // denied" (confirmed against a real router — every login.html/css/js/
    // image upload failed silently this way, regardless of the URL or
    // RouterOS firmware version), so the captive portal's html-directory
    // never actually received any files. The FTP *server* is disabled
    // outright below instead, closing the door this was originally meant
    // to close without breaking /tool fetch.
    await client.talk(["/user/group/remove", "=numbers=safelinkhub-group"]).catch(() => {});
    await run(
      [
        "/user/group/add",
        "=name=safelinkhub-group",
        "=policy=read,write,test,sensitive,api,ssh,ftp,!local,!telnet,!reboot,!policy,!winbox,!password,!web,!sniff,!romon,!rest-api",
      ],
      "SafeLinkHub API user group",
    );

    // Manual backup helper: exports the full config plus hotspot/NAT/filter
    // sections separately, timestamped, for whenever an admin wants a
    // one-off snapshot straight from the router's own terminal/scheduler.
    await client.talk(["/system/script/remove", "=numbers=export-all"]).catch(() => {});
    await run(
      [
        "/system/script/add",
        "=name=export-all",
        "=dont-require-permissions=no",
        `=owner=${router.username}`,
        "=policy=ftp,reboot,read,write,policy,test,password,sniff,sensitive,romon",
        '=source=:local date [/system clock get date];:local time [/system clock get time];:local filename ("backup-" . [:pick $date 7 11] . "-" . [:pick $date 0 3] . [:pick $date 4 6]);/export compact file=$filename;/ip hotspot export file=("hotspot-" . $filename);/ip firewall nat export file=("nat-" . $filename);/ip firewall filter export file=("filter-" . $filename);:log info ("Export termine : " . $filename)',
      ],
      "export-all backup script",
    );

    if (opts.reboot) {
      log.push("Rebooting router to finalize setup...");
      // RouterOS drops the API connection on reboot before it can reply, so
      // we fire the command and don't wait for a response.
      client.talk(["/system/reboot"]).catch(() => {});
    }

    const persistableOpts = { ...opts, reboot: undefined };
    delete persistableOpts.bridgeName;

    // Branding portail scopé au routeur (saisi dans l'auto-setup) : on ne
    // persiste que les champs FOURNIS (undefined = ne pas toucher, pour les
    // appelants historiques). "" / [] sont des valeurs explicites (effacer).
    const portalBranding: {
      portalSupportWhatsapp?: string;
      portalSupportPhone?: string;
      portalVendors?: { name: string; location: string; phone: string }[];
    } = {};
    if (opts.portalSupportWhatsapp !== undefined)
      portalBranding.portalSupportWhatsapp = opts.portalSupportWhatsapp.trim();
    if (opts.portalSupportPhone !== undefined)
      portalBranding.portalSupportPhone = opts.portalSupportPhone.trim();
    if (opts.portalVendors !== undefined)
      portalBranding.portalVendors = opts.portalVendors
        .map((v) => ({ name: v.name.trim(), location: v.location.trim(), phone: v.phone.trim() }))
        .filter((v) => v.name || v.location || v.phone);

    // Persisted on every successful run (not just billed ones) so other
    // code paths that look up this router's live hotspot config (the
    // connection test, captive-template assignment) resolve the canonical
    // SAFELINKHUB-BRIDGE and the selected hotspot server name.
    await db
      .update(routers)
      .set({
        hotspotBridgeName: bridgeName,
        hotspotServerName: serverName,
        ...portalBranding,
        // Snapshot of this run's options (minus reboot, re-decided fresh
        // each time) — see lastAutoSetupConfig's schema comment. Lets a
        // later "Continuer l'auto-setup" repair replay this exact
        // configuration against whatever the audit found missing,
        // without the admin re-entering every wizard field.
        lastAutoSetupConfig: persistableOpts,
      })
      .where(eq(routers.id, routerId));

    // Keep the draft `bridges` row (sketched in the topology builder,
    // possibly before this router was ever provisioned) in sync with the
    // live RouterOS state — name AND gateway/prefix, since the auto-setup
    // step now lets the admin pick a different gateway/subnet than the
    // topology draft. Without this every other screen reading the bridges
    // row (captive-template assignment, the topology canvas, the recap)
    // keeps showing stale values forever, looking like a duplicate config.
    await db
      .update(bridges)
      .set({
        name: bridgeName,
        gatewayIp: opts.hotspotAddress.trim(),
        subnetBits: opts.hotspotPrefixBits,
      })
      .where(and(eq(bridges.routerId, routerId), eq(bridges.hotspotEnabled, true)));

    if (billableCents !== null) {
      await db.update(routers).set({ autoSetupBilled: true }).where(eq(routers.id, routerId));
      if (billableCents === 0) {
        await db
          .update(organizations)
          .set({ freeRouterSetupUsed: true })
          .where(eq(organizations.id, org.id));
        log.push("OK: essai gratuit de configuration automatique utilisé pour ce routeur.");
      } else {
        if (balanceSource === "safecoin") {
          log.push(
            `OK: ${(safecoinRequiredScCents / 100).toLocaleString("fr-FR")} SC débités pour cette configuration.`,
          );
        } else {
          await db.insert(walletTransactions).values({
            orgId: org.id,
            type: "charge",
            amountCents: billableCents,
            note: `Configuration automatique — ${router.name} (${opts.supportsContainers ? "Hotspot + MikHmon" : "Hotspot"})`,
            createdBy: session.userId,
          });
          log.push(
            `OK: ${billableCents.toLocaleString("fr-FR")} FCFA débités du portefeuille pour cette configuration.`,
          );
        }
      }
    }

    // Auto-setup réussi : consomme l'autorisation (une par paiement). Le
    // superadmin n'en a jamais, donc rien à consommer pour lui.
    if (gate.reason === "authorized" && gate.authorizationId) {
      await consumeAuthorization(gate.authorizationId);
    }

    // Parrainage : le filleul vient de réussir un auto-setup → prime au parrain.
    // Idempotente (une seule fois par filleul) et best-effort : un auto-setup
    // réussi ne doit pas être signalé en échec parce qu'une prime a raté.
    await awardReferral(org.id, "auto_setup");

    return {
      success: true,
      containerPending: containerSetup.status === "pending",
      log,
    };
  } finally {
    client.close();
  }
}

/**
 * Re-runs provisionHotspotStack against whatever HotspotStackOptions it
 * was last called with for this router (lastAutoSetupConfig) — every
 * step inside is already idempotent (checks live router state before
 * acting), so this only actually changes what auditRouterConfig found
 * missing/incomplete; steps that are already correct are left alone.
 * Lets the admin "continue" a partially-completed auto-setup from the
 * config-audit banner instead of re-typing every wizard field from
 * scratch. reboot is forced off — a quick repair shouldn't bounce the
 * router unless the admin explicitly re-runs the full wizard.
 */
export async function repairRouterConfig(routerId: string) {
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
  if (!router.lastAutoSetupConfig) {
    return {
      error:
        "Aucune configuration d'auto-setup enregistrée pour ce routeur — lancez d'abord l'assistant complet (Configuration routeur) une fois avant de pouvoir réparer une étape manquante.",
    };
  }

  return provisionHotspotStack(routerId, {
    ...(router.lastAutoSetupConfig as HotspotStackOptions),
    reboot: false,
  });
}

// The standalone createDockerContainer entry point (DOCKERS bridge + MikHmon
// from the topology step) was removed: it duplicated provisionDockerStack's
// invocation inside provisionHotspotStack — the auto-setup step is now the
// single path that provisions the container stack.
