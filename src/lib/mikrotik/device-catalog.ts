export type WifiBands = "2.4" | "2.4+5" | "none";

/**
 * RouterOS package architecture — what /system/resource's
 * "architecture-name" actually reports, used as-is (not a SafeLinkHub
 * invention) so detection never has to guess at a mapping.
 */
export type Architecture = "arm" | "arm64" | "mipsbe" | "mmips" | "smips" | "tile";

export type MikrotikModel = {
  boardName: string;
  architecture: Architecture;
  wifiBands: WifiBands;
  /**
   * True on container-capable boards whose onboard flash is too small to
   * pull/extract the MikHmon image on its own (e.g. L009, hAP ax³,
   * Chateau PRO ax) — these need a USB stick plugged in for /container/
   * config's tmpdir, or the pull silently fails / fills the flash. False on
   * boards confirmed to work fine off onboard flash/tmpfs alone (hAP ax
   * lite, hAP ax²). Defaults to false for any board not listed below — that
   * just means the wizard won't warn proactively, not that USB is unneeded;
   * /system/resource/usb/print live detection (hasUsbStorage) still drives
   * which storage mode container-setup.ts actually uses either way.
   */
  requiresUsbForContainer?: boolean;
  /**
   * True on boards with enough onboard storage to hold the MikHmon image
   * directly (RB4011 series, RB3011, RB5009 — vs hAP ax lite/ax²'s ~16MB)
   * — these host MikHmon on the router's own internal disk (the /disk slot
   * named "disk1"/"disk…", or a plain Files directory when no slot is
   * listed) instead of a USB stick or the RAM-backed tmpfs scratch space:
   * no key to plug in, and the image survives reboots. NEVER falls back to
   * tmpfs on these boards. Mutually exclusive in practice with
   * requiresUsbForContainer; both default to false/unset.
   */
  hasLargeOnboardStorage?: boolean;
  /**
   * True sur les modèles enterprise avec eMMC interne ≥ 4 GB
   * (CCR2004, CCR2116, CCR2216, CRS354…). Ces modèles n'utilisent JAMAIS
   * tmpfs et n'ont pas besoin de USB : MikHmon vit sur le disque interne
   * (slot "disk1") et survit au reboot. Traité comme hasLargeOnboardStorage
   * côté stockage, mais distingué pour l'UI (badge « eMMC ») et pour garantir
   * le never-tmpfs même si le slot disk1 n'est pas encore live-détecté.
   */
  hasEmmcStorage?: boolean;
};

/**
 * Les 4 scénarios de déploiement MikHmon, dérivés du couple architecture +
 * stockage. Partagé backend (container-setup) ↔ UI (badges) pour un vocabulaire
 * unique. 1 = USB/microSD, 2 = flash interne limité (tmpfs), 3 = eMMC/flash
 * interne généreux, 4 = pas de container (Legacy/VPS).
 */
export type DeploymentScenario = 1 | 2 | 3 | 4;

export function deploymentScenario(input: {
  supportsContainers: boolean;
  hasUsbStorage: boolean;
  hasEmmcStorage: boolean;
  hasLargeOnboardStorage: boolean;
}): DeploymentScenario {
  if (!input.supportsContainers) return 4; // architecture MIPS ou RouterOS < v7
  if (input.hasUsbStorage) return 1; // clé USB / microSD branchée (recommandé)
  if (input.hasEmmcStorage || input.hasLargeOnboardStorage) return 3; // disque interne — jamais tmpfs
  return 2; // flash interne limité → pull en tmpfs (usure NAND possible)
}

export function scenarioLabel(scenario: DeploymentScenario): string {
  switch (scenario) {
    case 1:
      return "USB + Container";
    case 2:
      return "Flash + Container";
    case 3:
      return "eMMC + Container";
    case 4:
      return "Legacy (Hotspot seul)";
  }
}

/** Emoji d'état par scénario (repris tel quel dans les badges UI). */
export function scenarioEmoji(scenario: DeploymentScenario): string {
  switch (scenario) {
    case 1:
      return "🟢";
    case 2:
      return "🟡";
    case 3:
      return "🔵";
    case 4:
      return "⚪";
  }
}

/**
 * RouterOS Container support (used to run MikHmon) is only available on
 * arm, arm64 and tile builds — never on mipsbe/mmips/smips. This is a hard
 * platform limitation (MikroTik's own container docs), not a SafeLinkHub
 * choice, so the auto-setup must skip the container step entirely on those
 * boards rather than fail halfway through.
 */
const CONTAINER_CAPABLE: ReadonlySet<Architecture> = new Set(["arm", "arm64", "tile"]);

export function architectureSupportsContainers(architecture: Architecture): boolean {
  return CONTAINER_CAPABLE.has(architecture);
}

export function architectureLabel(architecture: Architecture): string {
  switch (architecture) {
    case "arm64":
      return "ARM 64bit";
    case "arm":
      return "ARM 32bit";
    case "mipsbe":
      return "MIPSBE (MIPS big-endian)";
    case "mmips":
      return "MMIPS";
    case "smips":
      return "SMIPS";
    case "tile":
      return "Tile (CCR ancien)";
  }
}

/**
 * Current (non-archived) MikroTik boards with onboard WiFi, ARM/ARM64 only,
 * excluding 5GHz-only models. `boardName` matches the value RouterOS reports
 * in /system/resource/print's board-name (and /system/routerboard's
 * model, for boards where the two differ in case/spacing).
 */
export const MIKROTIK_MODELS: MikrotikModel[] = [
  // 2.4GHz only
  { boardName: "hAP ax lite", architecture: "arm", wifiBands: "2.4" },
  {
    boardName: "L009UiGS-2HaxD-IN",
    architecture: "arm",
    wifiBands: "2.4",
    requiresUsbForContainer: true,
  },

  // 2.4GHz + 5GHz, ARM 32bit
  { boardName: "hAP be lite", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "Audience", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "cAP ac", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "hAP ac²", architecture: "arm", wifiBands: "2.4+5" },
  {
    boardName: "RB4011iGS+5HacQ2HnD-IN",
    architecture: "arm",
    wifiBands: "2.4+5",
    hasLargeOnboardStorage: true,
  },
  { boardName: "hAP ac³", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "cAP XL ac", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "Chateau LTE6-US", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "Chateau LTE7", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "Chateau LTE12", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "wAP ax", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "hAP ax S", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "mANTBox ax 15s", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "NetMetal ax", architecture: "arm", wifiBands: "2.4+5" },
  { boardName: "L23UGSR-5HaxD2HaxD", architecture: "arm", wifiBands: "2.4+5" },

  // 2.4GHz + 5GHz, ARM 64bit
  { boardName: "hAP be³ Media", architecture: "arm64", wifiBands: "2.4+5" },
  { boardName: "CRS418-8P-8G-2S+5axQ2axQ-RM", architecture: "arm64", wifiBands: "2.4+5" },
  { boardName: "Chateau LTE7 ax", architecture: "arm64", wifiBands: "2.4+5" },
  { boardName: "wAP ax LTE7 kit", architecture: "arm64", wifiBands: "2.4+5" },
  { boardName: "Chateau LTE18 ax", architecture: "arm64", wifiBands: "2.4+5" },
  { boardName: "cAP LTE12 ax", architecture: "arm64", wifiBands: "2.4+5" },
  { boardName: "Chateau 5G R17 ax", architecture: "arm64", wifiBands: "2.4+5" },
  { boardName: "hAP ax²", architecture: "arm64", wifiBands: "2.4+5" },
  {
    boardName: "hAP ax³",
    architecture: "arm64",
    wifiBands: "2.4+5",
    requiresUsbForContainer: true,
  },
  { boardName: "cAP ax", architecture: "arm64", wifiBands: "2.4+5" },
  {
    boardName: "Chateau PRO ax",
    architecture: "arm64",
    wifiBands: "2.4+5",
    requiresUsbForContainer: true,
  },

  // Wired-only ARM/ARM64 boards with Container support but no onboard
  // WiFi. All of these have enough internal storage to host MikHmon
  // directly (RB4011 512MB NAND, RB3011 128MB NAND, RB5009 1GB NAND) —
  // no USB stick and never the tmpfs fallback (confirmed in the field:
  // the RB3011/RB4011 install was wrongly asking for a key).
  {
    boardName: "RB4011iGS+RM",
    architecture: "arm",
    wifiBands: "none",
    hasLargeOnboardStorage: true,
  },
  {
    boardName: "RB3011UiAS-RM",
    architecture: "arm",
    wifiBands: "none",
    hasLargeOnboardStorage: true,
  },
  {
    boardName: "RB5009UG+S+IN",
    architecture: "arm64",
    wifiBands: "none",
    hasLargeOnboardStorage: true,
  },
  {
    boardName: "RB5009UPr+S+IN",
    architecture: "arm64",
    wifiBands: "none",
    hasLargeOnboardStorage: true,
  },

  // Enterprise CCR/CRS — eMMC interne (≥ 4 GB), architecture arm/arm64/tile
  // avec Container. MikHmon vit sur "disk1" (jamais tmpfs) et survit au reboot ;
  // aucune clé USB requise. Scénario 3.
  {
    boardName: "CCR2004-1G-12S+2XS",
    architecture: "arm64",
    wifiBands: "none",
    hasEmmcStorage: true,
  },
  {
    boardName: "CCR2116-12G-4S+",
    architecture: "arm64",
    wifiBands: "none",
    hasEmmcStorage: true,
  },
  {
    boardName: "CCR2216-1G-12XS-2XQ",
    architecture: "arm64",
    wifiBands: "none",
    hasEmmcStorage: true,
  },
  {
    boardName: "CRS354-48G-4S+2Q+RM",
    architecture: "arm",
    wifiBands: "none",
    hasEmmcStorage: true,
  },

  // Legacy MIPS boards — still common in the field, but no Container
  // support, so the auto-setup wizard runs the hotspot/WiFi steps only and
  // skips the DOCKERS/MikHmon step on these.
  { boardName: "RB951Ui-2HnD", architecture: "mipsbe", wifiBands: "2.4" },
  { boardName: "RB951G-2HnD", architecture: "mipsbe", wifiBands: "2.4" },
  { boardName: "hEX", architecture: "mmips", wifiBands: "none" },
  { boardName: "hEX S", architecture: "mmips", wifiBands: "none" },
  { boardName: "wAP", architecture: "mmips", wifiBands: "2.4" },
  { boardName: "wAP AC", architecture: "mmips", wifiBands: "2.4+5" },
];

function normalize(s: string) {
  // ² / ³ deviennent "2" / "3" (et non supprimés) — sinon "hAP ax²" et
  // "hAP ax³" se normalisent tous deux en "hapax" et le premier de la
  // liste gagne : un vrai ax³ matchait l'entrée ax² et perdait son flag
  // requiresUsbForContainer.
  return s.toLowerCase().replace(/²/g, "2").replace(/³/g, "3").replace(/[\s-]/g, "");
}

/**
 * RouterOS often reports the internal RouterBOARD part number (e.g.
 * "C52iG-5HaxD2HaxD") rather than the marketing name ("hAP ax²") in
 * /system/routerboard's "model" field — the two differ per board and aren't
 * derivable from each other by normalization alone, so confirmed codes are
 * listed explicitly here as we verify them against real devices.
 */
const BOARD_CODE_ALIASES: Record<string, string> = {
  "C52iG-5HaxD2HaxD": "hAP ax²",
  // Confirmed via MikroTik's own product page — without this alias, a real
  // hAP ax³ never matched the catalog entry, so requiresUsbForContainer
  // silently fell back to false and the auto-setup took the tmpfs branch
  // instead of formatting/using the USB stick (usb1/pull) this board
  // actually needs.
  "C53UiG+5HPaxD2HPaxD": "hAP ax³",
};

/** Matches a RouterOS board-name/model string against the catalog, tolerant
 * of the superscript ²/³ vs "2"/"3" and spacing/case differences RouterOS
 * versions are inconsistent about. */
export function findMikrotikModel(boardName: string | null | undefined): MikrotikModel | null {
  if (!boardName) return null;

  const aliasKey = Object.keys(BOARD_CODE_ALIASES).find(
    (code) => normalize(code) === normalize(boardName),
  );
  const target = normalize(aliasKey ? BOARD_CODE_ALIASES[aliasKey] : boardName);

  return (
    MIKROTIK_MODELS.find((m) => normalize(m.boardName) === target) ??
    MIKROTIK_MODELS.find(
      (m) => target.includes(normalize(m.boardName)) || normalize(m.boardName).includes(target),
    ) ??
    null
  );
}
