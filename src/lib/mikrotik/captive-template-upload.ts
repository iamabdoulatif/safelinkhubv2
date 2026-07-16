import { ROUTEROS_DESYNC_MESSAGE, type RouterOSClient } from "./client";
import type { PackageFile } from "@/lib/captive-templates/package-files";

export type CaptiveTemplateUploadResult = {
  uploaded: string[];
  failed: { path: string; error: string }[];
};

/**
 * Pushes every file of a "package" captive template onto the router's
 * hotspot html-directory via `/tool fetch`, one file at a time — RouterOS
 * has no bulk-upload API call, but `/tool fetch` happily creates the
 * slash-delimited virtual subdirectories (css/, js/, images/) under flash
 * on its own. Each fetch targets a URL on SafeLinkHub itself that renders
 * the file with {{SSID}} substituted for the router's live WiFi SSID, so
 * the portal is automatically rebranded with the hotspot's own name.
 */
export async function uploadCaptiveTemplatePackage(
  client: RouterOSClient,
  opts: {
    files: PackageFile[];
    htmlDirectory: string;
    fileBaseUrl: string; // e.g. https://safelinkhub.vercel.app/api/router/v1/<slug>/captive-template/<templateId>
    ssid: string;
    routerId?: string; // injecté dans {{ROUTER_ID}} → le portail cible ce routeur au paiement
    timeoutMs?: number;
  },
): Promise<CaptiveTemplateUploadResult> {
  const result: CaptiveTemplateUploadResult = { uploaded: [], failed: [] };
  // This budget is per REPLY sentence, and it has to outlast RouterOS's own
  // give-up time: a stalled TLS handshake to the CDN reports "status=connecting"
  // for ~30s before it finally answers "!trap SSL: handshake timed out" (seen
  // in the wild on this fleet). Those progress updates normally land ~1/s, so a
  // short budget survives by luck; the moment one gap outlasts it we abandon a
  // command RouterOS is still answering, and its late sentences get read as the
  // NEXT file's reply — poisoning every remaining file. Sitting above the ~30s
  // verdict means we always read the real answer instead of racing it.
  const timeoutMs = opts.timeoutMs ?? 60000;

  const fetchOne = async (file: PackageFile) => {
    const routerParam = opts.routerId ? `&routerId=${encodeURIComponent(opts.routerId)}` : "";
    const url = `${opts.fileBaseUrl}?path=${encodeURIComponent(file.path)}&ssid=${encodeURIComponent(opts.ssid)}${routerParam}`;
    const dstPath = `${opts.htmlDirectory}/${file.path}`;
    const replies = await client.talk(
      [
        "/tool/fetch",
        `=url=${url}`,
        `=dst-path=${dstPath}`,
        "=mode=https",
        // RouterOS's CA bundle can be stale on devices that haven't
        // had a package update in a while, which fails the TLS
        // handshake to Vercel's cert chain specifically (other
        // RouterOS versions/boards connect fine) — these are public
        // template assets, not secrets, so skipping cert validation
        // here is an acceptable trade-off to not silently lose the
        // whole captive portal install over it.
        "=check-certificate=no",
      ],
      timeoutMs,
    );
    // /tool/fetch can report failure via a normal "!re" sentence
    // (status=failed, e.g. "dns error", "no such host") followed by a
    // routine "!done" — not necessarily a "!trap" — so a call that
    // never threw was still being recorded as uploaded even when
    // RouterOS never actually wrote the file. Check the reported
    // status explicitly instead of trusting "didn't throw".
    const fetchStatus = replies.findLast((reply) => reply.status)?.status;
    if (fetchStatus && fetchStatus !== "finished") {
      throw new Error(`fetch status: ${fetchStatus}`);
    }
  };

  const errorOf = (err: unknown) => (err instanceof Error ? err.message : "Unknown error");

  for (const file of opts.files) {
    try {
      await fetchOne(file);
      result.uploaded.push(file.path);
    } catch (err) {
      result.failed.push({ path: file.path, error: errorOf(err) });
    }
  }

  // A dropped TLS handshake is transient (the router's uplink is shared with
  // the hotspot's own clients, so peak-hour bursts stall a handshake now and
  // then) — a second pass usually lands the stragglers.
  const isDesync = (message: string) => message.includes(ROUTEROS_DESYNC_MESSAGE);
  for (const failure of [...result.failed]) {
    // Once the stream is out of sync every further command fails on arrival;
    // retrying only delays an install that already needs a fresh connection.
    if (result.failed.some((f) => isDesync(f.error))) break;
    const file = opts.files.find((f) => f.path === failure.path);
    if (!file) continue;
    try {
      await fetchOne(file);
      result.uploaded.push(file.path);
      result.failed = result.failed.filter((f) => f.path !== file.path);
    } catch (err) {
      failure.error = errorOf(err);
    }
  }

  return result;
}

/** Reads the router's first configured WiFi SSID — used to auto-rename the captive portal to match the hotspot's actual name. */
export async function getRouterPrimarySsid(
  client: RouterOSClient,
  timeoutMs = 30000,
): Promise<string | null> {
  const rows = await client.talk(["/interface/wifi/print"], timeoutMs).catch(() => []);
  const ssid = rows.map((r) => r["configuration.ssid"]).find((s) => s && s.trim());
  return ssid?.trim() || null;
}
