"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { RouterOSClient } from "./client";
import { decryptSecret } from "./crypto";
import { openRouterTunnelWithRetry } from "./relay";
import {
  architectureSupportsContainers,
  findMikrotikModel,
  type Architecture,
  type MikrotikModel,
} from "./device-catalog";

const KNOWN_ARCHITECTURES: readonly Architecture[] = [
  "arm",
  "arm64",
  "mipsbe",
  "mmips",
  "smips",
  "tile",
];
const DEVICE_MODE_UNLOCK_WORDS = [
  "/system/device-mode/update",
  "=mode=advanced",
  "=container=yes",
  "=hotspot=yes",
  "=scheduler=yes",
  "=fetch=yes",
  "=activation-timeout=10m",
] as const;

function parseArchitecture(raw: string): Architecture | null {
  const normalized = raw.trim().toLowerCase();
  return (KNOWN_ARCHITECTURES.find((a) => a === normalized) as Architecture | undefined) ?? null;
}

function parseRosBoolean(raw: string | undefined): boolean {
  return raw === "true" || raw === "yes";
}

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

export type DetectedRouter = {
  boardName: string;
  architectureName: string;
  architecture: Architecture | null;
  model: MikrotikModel | null;
  hasUsbStorage: boolean;
  /** True if the device itself reports a second WiFi radio (wifi2), whether
   * or not its board name matched the static catalog above — this is the
   * value the auto-setup actually relies on for "did we recognize the
   * model", since it's read straight from RouterOS instead of guessed from
   * a name string that varies by firmware/locale. */
  dualBand: boolean;
  /** RouterOS Container only runs on arm/arm64/tile builds — mipsbe/mmips/
   * smips boards (RB951, hEX, hEX S, plain wAP, ...) can't run MikHmon at
   * all, so the auto-setup must skip that step on those rather than fail. */
  supportsContainers: boolean;
  routerosVersion: string;
  /** "home" | "basic" | "advanced" | "rose" — see
   * https://help.mikrotik.com/docs/spaces/ROS/pages/93749258/Device-mode.
   * Container is OFF by default in every mode except ROSE, even on
   * container-capable hardware, until explicitly unlocked. */
  deviceMode: string | null;
  /** The device-mode "container" flag itself — independent from
   * supportsContainers (architecture). Both must be true for the container
   * step to actually run. */
  containerFeatureEnabled: boolean | null;
  /** True on boards confirmed to need a USB stick for MikHmon's container
   * storage (L009, hAP ax³, RB3011, Chateau PRO ax — onboard flash is too
   * small) — see device-catalog.ts. False for boards confirmed to work off
   * onboard flash/tmpfs alone (hAP ax lite, hAP ax²), and also false for
   * any unrecognized board (no basis to warn either way). */
  requiresUsbForContainer: boolean;
  /** True on boards confirmed to have enough onboard flash (e.g. RB4011) to
   * hold the MikHmon image directly in a "disk1" Files directory instead of
   * the RAM-backed tmpfs scratch space — see device-catalog.ts. Only takes
   * effect when hasUsbStorage is false (a plugged-in USB stick still wins). */
  hasLargeOnboardStorage: boolean;
};

/**
 * Reads /system/resource and /system/routerboard from the live device and
 * matches the reported board against the supported-models catalog, so the
 * auto-setup wizard can skip asking the admin things RouterOS already knows
 * (5GHz availability, ARM32 vs ARM64, whether there's a USB slot to use for
 * the container image instead of onboard flash/tmpfs).
 */
export async function detectRouterModel(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
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

  try {
    const [resource] = await client.talk(["/system/resource/print"]);
    const [board] = await client.talk(["/system/routerboard/print"]).catch(() => []);
    const usbRows = await client.talk(["/system/resource/usb/print"]).catch(() => []);
    const diskRows = await client.talk(["/disk/print"]).catch(() => []);
    const wifiRows = await client.talk(["/interface/wifi/print"]).catch(() => []);
    const [deviceModeRow] = await client.talk(["/system/device-mode/print"]).catch(() => []);

    // Prefer the marketing board-name RouterOS exposes on /system/resource;
    // fall back to /system/routerboard's internal part number only if that's
    // blank (some firmware/locale combos omit one or the other).
    const boardName = resource?.["board-name"] || board?.model || "";
    const architectureName = resource?.["architecture-name"] ?? "";
    const architecture = parseArchitecture(architectureName);
    const model = findMikrotikModel(boardName) ?? findMikrotikModel(board?.model);

    const detected: DetectedRouter = {
      boardName,
      architectureName,
      architecture,
      model,
      hasUsbStorage: usbRows.length > 0,
      // wifi2 existing live is the primary signal, but if the catalog
      // already confirms a dual-band board, trust that too — a flaky/empty
      // /interface/wifi/print read should never under-report capability.
      dualBand: wifiRows.some((r) => r.name === "wifi2") || model?.wifiBands === "2.4+5",
      // Read straight from the device's reported architecture, not the
      // catalog match — works even for boards absent from the table above.
      supportsContainers: architecture ? architectureSupportsContainers(architecture) : true,
      routerosVersion: resource?.version ?? "",
      deviceMode: deviceModeRow?.mode ?? null,
      requiresUsbForContainer: model?.requiresUsbForContainer ?? false,
      // Live disk1-slot detection (same signal install-vpn/route.ts's
      // bootstrap script uses) takes priority over the static catalog flag,
      // so any board reporting its own internal disk slot is recognized
      // even if it isn't listed in device-catalog.ts yet.
      hasLargeOnboardStorage:
        diskRows.some((d) => d.slot === "disk1") || (model?.hasLargeOnboardStorage ?? false),
      containerFeatureEnabled: deviceModeRow ? parseRosBoolean(deviceModeRow.container) : null,
    };

    return { success: true, detected };
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Detection failed: ${err.message}` : "Detection failed.",
    };
  } finally {
    client.close();
  }
}

/**
 * Requests the device-mode change to advanced + container=yes. This is as
 * far as any script — ours or anyone else's — can automate this: MikroTik
 * requires a physical confirmation (reset button press, or a cold
 * power-cycle) within the activation window before the change actually
 * takes effect, specifically so a remote attacker (or a buggy script)
 * can't silently unlock a device. See
 * https://help.mikrotik.com/docs/spaces/ROS/pages/93749258/Device-mode.
 */
export async function requestDeviceModeUnlock(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (!router || router.orgId !== session.orgId) {
    return { error: "Router not found." };
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

  try {
    await client.talk([...DEVICE_MODE_UNLOCK_WORDS]);
    return {
      success: true,
      message:
        "Demande envoyée. Pour confirmer : appuyez sur le bouton reset/mode de l'appareil, ou débranchez/rebranchez son alimentation, dans les 10 prochaines minutes. Le routeur redémarrera automatiquement une fois confirmé.",
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Échec de la demande de déverrouillage : ${err.message}`
          : "Échec de la demande de déverrouillage.",
    };
  } finally {
    client.close();
  }
}
