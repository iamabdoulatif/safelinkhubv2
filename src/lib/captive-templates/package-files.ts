import { readFileSync } from "fs";
import path from "path";

export type PackageFile = {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
};

const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".svg"]);

// Listed explicitly (rather than walked at runtime) so Next.js's file
// tracer can see every path statically and bundle them into the deployed
// function — a dynamic directory walk over `packages/` would not be
// reliably included by the Vercel build.
const SAFELINKHUB_DEFAULT_FILES = [
  "login.html",
  "alogin.html",
  "rlogin.html",
  "redirect.html",
  "logout.html",
  "error.html",
  "status.html",
  "md5.js",
  "css/style.css",
  "js/app.js",
  "images/wifi.svg",
  "images/wave.png",
  "images/orange.png",
  "images/mtn-momo.png",
  "images/moov.png",
];

function loadPackage(dir: string, files: string[]): PackageFile[] {
  return files.map((relativePath) => {
    const ext = path.extname(relativePath);
    const isText = TEXT_EXTENSIONS.has(ext);
    const absolutePath = path.join(dir, relativePath);
    const content = isText
      ? readFileSync(absolutePath, "utf8")
      : readFileSync(absolutePath).toString("base64");
    return { path: relativePath, content, encoding: isText ? "utf8" : "base64" } as const;
  });
}

/** Reads the bundled SafeLinkHub default hotspot portal off disk, ready to store in `captiveTemplates.packageFiles`. */
export function loadSafelinkhubDefaultPackage(): PackageFile[] {
  const dir = path.join(process.cwd(), "src/lib/captive-templates/packages/safelinkhub-default");
  return loadPackage(dir, SAFELINKHUB_DEFAULT_FILES);
}

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export function contentTypeForPath(relativePath: string) {
  return EXT_TO_CONTENT_TYPE[path.extname(relativePath)] ?? "application/octet-stream";
}

/** Substitutes the {{SSID}} placeholder in a package file's rendered content with the router's live WiFi SSID. */
export function renderPackageFile(file: PackageFile, ssid: string): Buffer {
  if (file.encoding === "base64") return Buffer.from(file.content, "base64");
  const rendered = file.content.replaceAll("{{SSID}}", ssid);
  return Buffer.from(rendered, "utf8");
}
