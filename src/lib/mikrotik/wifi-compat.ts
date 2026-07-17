import type { RouterOSClient } from "./client";

/**
 * Couche de compatibilité WiFi entre générations de MikroTik.
 *
 * RouterOS expose DEUX API WiFi incompatibles :
 *   - `/interface/wifi`     — boards ax (hAP ax lite/ax²/ax³), champs
 *                             `configuration.ssid`, radios wifi1/wifi2.
 *   - `/interface/wireless` — boards legacy (RB951, RB4011 sans le paquet
 *                             wifi-qcom-ac), champ `ssid`, radios wlan1/wlan2.
 *
 * L'API ne se déduit PAS du modèle : relevé sur le parc, deux
 * RB4011iGS+5HacQ2HnD strictement identiques répondent différemment — MAMBA
 * WIFI n'expose que `/interface/wireless` (wlan1+wlan2) tandis que HSPT-ROXY
 * n'expose que `/interface/wifi` (wifi1), selon le paquet installé. Et un
 * RB4011iGS+ n'a aucune radio. D'où une détection LIVE sur l'appareil, seule
 * source de vérité fiable.
 */
export type WifiApi = "wifi" | "wireless" | "none";

export type WifiRadio = {
  name: string;
  ssid: string | null;
  /** 5GHz si connu ; null quand la board ne le dit pas. */
  band5ghz: boolean | null;
  disabled: boolean;
};

export type WifiState = {
  api: WifiApi;
  radios: WifiRadio[];
};

/** Le SSID le plus représentatif : première radio active qui en déclare un. */
export function primarySsid(state: WifiState): string | null {
  const named = state.radios.find((r) => r.ssid && r.ssid.trim());
  return named?.ssid?.trim() ?? null;
}

/**
 * Détecte l'API et lit les radios.
 *
 * Ordre volontaire : `/interface/wifi` d'abord, mais on bascule sur
 * `/interface/wireless` dès qu'il renvoie ZÉRO ligne — sur les boards legacy la
 * commande existe et répond une liste vide au lieu d'échouer, si bien qu'un
 * simple try/catch conclurait « pas de WiFi » sur un routeur qui en a deux.
 */
export async function readWifiState(client: RouterOSClient, timeoutMs = 20000): Promise<WifiState> {
  const wifiRows = await client.talk(["/interface/wifi/print"], timeoutMs).catch(() => null);
  if (wifiRows && wifiRows.length > 0) {
    const radios = await client
      .talk(["/interface/wifi/radio/print"], timeoutMs)
      .catch(() => [] as Record<string, string>[]);
    return {
      api: "wifi",
      radios: wifiRows
        .filter((r) => r.name)
        .map((r) => {
          const radio = radios.find(
            (x) => x.interface === r.name || x.interface === r["default-name"],
          );
          return {
            name: r.name,
            ssid: r["configuration.ssid"] ?? null,
            band5ghz: radio ? (radio.bands ?? "").includes("5ghz") : null,
            disabled: r.disabled === "true",
          };
        }),
    };
  }

  const legacyRows = await client.talk(["/interface/wireless/print"], timeoutMs).catch(() => null);
  if (legacyRows && legacyRows.length > 0) {
    return {
      api: "wireless",
      radios: legacyRows
        .filter((r) => r.name)
        .map((r) => ({
          name: r.name,
          ssid: r.ssid ?? null,
          band5ghz: (r.band ?? "").includes("5ghz"),
          disabled: r.disabled === "true",
        })),
    };
  }

  return { api: "none", radios: [] };
}

export type SsidApplyResult = {
  api: WifiApi;
  applied: string[];
  failed: { radio: string; error: string }[];
  /** Renseigné quand la cible n'a aucune radio : ce n'est pas une erreur. */
  note?: string;
};

/**
 * Pose le même SSID sur toutes les radios de la cible, via l'API qu'elle parle.
 *
 * Le SSID est identique sur 2.4 et 5GHz à dessein : c'est ce que fait déjà
 * l'auto-setup, et les clients basculent d'une bande à l'autre sans ressaisir
 * quoi que ce soit. Un routeur sans radio (RB4011iGS+, CCR) n'est pas une
 * erreur — il est simplement signalé, la restauration des tickets continue.
 */
export async function applySsid(
  client: RouterOSClient,
  ssid: string,
  opts: { country?: string; dryRun?: boolean; timeoutMs?: number } = {},
): Promise<SsidApplyResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const state = await readWifiState(client, timeoutMs);
  const result: SsidApplyResult = { api: state.api, applied: [], failed: [] };

  if (state.api === "none" || state.radios.length === 0) {
    result.note = "Ce routeur n'a aucune radio WiFi — SSID non applicable.";
    return result;
  }

  // "United States" = domaine réglementaire le plus permissif de RouterOS, donc
  // le plus de canaux pour l'auto-sélection. Même choix que l'auto-setup.
  const country = opts.country?.trim() || "United States";

  for (const radio of state.radios) {
    if (opts.dryRun) {
      result.applied.push(radio.name);
      continue;
    }
    try {
      if (state.api === "wifi") {
        // Bande lue sur la radio, jamais devinée d'après "wifi1" : sur une board
        // mono-radio (hAP ax lite) wifi1 est la 2.4GHz, et demander 5ghz-ax fait
        // rejeter le /interface/wifi/set ENTIER — SSID compris, en silence.
        const use5ghz =
          radio.band5ghz ?? (radio.name === "wifi1" && state.radios.length > 1);
        await client.talk(
          [
            "/interface/wifi/set",
            `=numbers=${radio.name}`,
            `=channel.band=${use5ghz ? "5ghz-ax" : "2ghz-ax"}`,
            "=channel.skip-dfs-channels=all",
            `=channel.width=${use5ghz ? "20/40/80mhz" : "20/40mhz"}`,
            `=configuration.country=${country}`,
            "=configuration.mode=ap",
            `=configuration.ssid=${ssid}`,
            "=disabled=no",
          ],
          timeoutMs,
        );
      } else {
        // Legacy : pas de champ "configuration.*", et surtout aucun réglage de
        // bande ici — la board legacy la tient de son mode/canal existant, et y
        // toucher ferait tomber les clients déjà associés.
        await client.talk(
          [
            "/interface/wireless/set",
            `=numbers=${radio.name}`,
            `=ssid=${ssid}`,
            "=mode=ap-bridge",
            "=disabled=no",
          ],
          timeoutMs,
        );
      }
      result.applied.push(radio.name);
    } catch (err) {
      result.failed.push({
        radio: radio.name,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }
  return result;
}
