import type { RouterOSClient } from "./client";
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
    timeoutMs?: number;
  },
): Promise<CaptiveTemplateUploadResult> {
  const result: CaptiveTemplateUploadResult = { uploaded: [], failed: [] };
  const timeoutMs = opts.timeoutMs ?? 15000;

  for (const file of opts.files) {
    const url = `${opts.fileBaseUrl}?path=${encodeURIComponent(file.path)}&ssid=${encodeURIComponent(opts.ssid)}`;
    const dstPath = `${opts.htmlDirectory}/${file.path}`;
    try {
      await client.talk(
        ["/tool/fetch", `=url=${url}`, `=dst-path=${dstPath}`, "=mode=https"],
        timeoutMs,
      );
      result.uploaded.push(file.path);
    } catch (err) {
      result.failed.push({
        path: file.path,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}

/** Reads the router's first configured WiFi SSID — used to auto-rename the captive portal to match the hotspot's actual name. */
export async function getRouterPrimarySsid(client: RouterOSClient): Promise<string | null> {
  const rows = await client.talk(["/interface/wifi/print"]).catch(() => []);
  const ssid = rows.map((r) => r["configuration.ssid"]).find((s) => s && s.trim());
  return ssid?.trim() || null;
}
