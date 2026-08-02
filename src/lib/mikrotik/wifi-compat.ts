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
  opts: {
    country?: string;
    dryRun?: boolean;
    timeoutMs?: number;
    // Largeur de canal 2.4GHz (défaut "20/40mhz"). L'optimisation débit passe
    // "20mhz" : en 2.4GHz encombrée, le 40MHz double le canal mais multiplie le
    // brouillage/les pertes — 20MHz est plus stable. Le 5GHz reste en
    // 20/40/80mhz (large = plein débit, peu de voisins).
    width2ghz?: string;
  } = {},
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
            `=channel.width=${use5ghz ? "20/40/80mhz" : opts.width2ghz ?? "20/40mhz"}`,
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

export type WifiOptimizeResult = SsidApplyResult & {
  /** SSID unifié appliqué à toutes les radios (band steering). */
  ssid: string | null;
  /** Résumé humain des changements, pour l'UI. */
  summary: string;
};

/**
 * OPTIMISE LE DÉBIT WiFi d'un routeur en un seul appel — le correctif « faible
 * connexion » packagé en fonctionnalité :
 *  1. UNIFIE le SSID sur toutes les radios (2.4 + 5GHz portent le MÊME nom) →
 *     les appareils basculent seuls sur la 5GHz rapide (band steering) ;
 *  2. 5GHz en 20/40/80MHz (plein débit, ~866Mbps) ;
 *  3. 2.4GHz en 20MHz (stable, moins de brouillage/pertes que 40MHz).
 *
 * Conserve le SSID EXISTANT du routeur (on ne renomme pas le réseau) : on prend
 * le SSID de la première radio active, ou celui fourni. Ne touche pas au hotspot
 * ni au reste. Sur une board legacy (/interface/wireless) : unifie au moins le
 * SSID (la largeur de canal n'y est pas pilotée de la même façon).
 */
export async function optimizeWifiThroughput(
  client: RouterOSClient,
  opts: { ssid?: string; country?: string; timeoutMs?: number } = {},
): Promise<WifiOptimizeResult> {
  const state = await readWifiState(client, opts.timeoutMs);
  // On garde le nom du réseau que les CLIENTS utilisent : de préférence celui de
  // la 2.4GHz (portée max, la majorité des appareils y sont, et il n'a
  // généralement pas de suffixe « -5G »), sinon le premier SSID trouvé. Sans ça,
  // on renommerait tout d'après la 5GHz (souvent « …-5G »), l'inverse du but.
  const band24 = state.radios.find((r) => r.band5ghz === false && r.ssid && r.ssid.trim());
  const ssid = opts.ssid?.trim() || band24?.ssid?.trim() || primarySsid(state);

  if (state.api === "none" || state.radios.length === 0) {
    return {
      api: state.api,
      applied: [],
      failed: [],
      ssid: null,
      note: "Ce routeur n'a aucune radio WiFi — rien à optimiser.",
      summary: "Aucune radio WiFi sur ce routeur.",
    };
  }
  if (!ssid) {
    return {
      api: state.api,
      applied: [],
      failed: [],
      ssid: null,
      summary: "Aucun SSID détecté — impossible d'optimiser (configurez d'abord le WiFi).",
    };
  }

  const res = await applySsid(client, ssid, {
    country: opts.country,
    timeoutMs: opts.timeoutMs,
    width2ghz: "20mhz",
  });

  const parts = [`SSID unifié « ${ssid} » sur ${res.applied.length} radio(s)`];
  if (state.api === "wifi") parts.push("5GHz en 80MHz, 2.4GHz en 20MHz");
  if (res.failed.length) parts.push(`${res.failed.length} radio(s) en échec`);
  return { ...res, ssid, summary: parts.join(" · ") };
}
