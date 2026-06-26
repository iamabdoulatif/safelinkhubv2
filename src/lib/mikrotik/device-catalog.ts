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
   * pull/extract the MikHmon image on its own (e.g. L009, hAP ax³, RB3011,
   * Chateau PRO ax) — these need a USB stick plugged in for /container/
   * config's tmpdir, or the pull silently fails / fills the flash. False on
   * boards confirmed to work fine off onboard flash/tmpfs alone (hAP ax
   * lite, hAP ax²). Defaults to false for any board not listed below — that
   * just means the wizard won't warn proactively, not that USB is unneeded;
   * /system/resource/usb/print live detection (hasUsbStorage) still drives
   * which storage mode container-setup.ts actually uses either way.
   */
  requiresUsbForContainer?: boolean;
};

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
  { boardName: "RB4011iGS+5HacQ2HnD-IN", architecture: "arm", wifiBands: "2.4+5" },
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

  // Wired-only ARM boards with Container support but no onboard WiFi.
  {
    boardName: "RB3011UiAS-RM",
    architecture: "arm",
    wifiBands: "none",
    requiresUsbForContainer: true,
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
  return s.toLowerCase().replace(/[\s²³]/g, "").replace(/-/g, "");
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
