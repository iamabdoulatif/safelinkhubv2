// Télécharger l'agent local DEPUIS le SaaS (sous le domaine safelinkhub.io),
// sans héberger les binaires dans le conteneur : la route relaie le flux de la
// release GitHub « agent-latest » (où la CI publie à chaque build) et le renvoie
// avec un en-tête de téléchargement. L'utilisateur voit une URL safelinkhub.io.
//
// Note : cela ne lève PAS le blocage macOS (tout téléchargement par navigateur
// est mis en quarantaine, quel que soit le site) — la commande Terminal
// `install-macos.sh` reste la voie fiable sur macOS.

const REPO = "iamabdoulatif/safelinkhubv2";
const REL = `https://github.com/${REPO}/releases/download/agent-latest`;
const RAW = `https://raw.githubusercontent.com/${REPO}/main/agent/packaging`;

// Allowlist : segment d'URL → source amont + type + nom de fichier servi.
const FILES: Record<string, { url: string; type: string; name: string; inline?: boolean }> = {
  "macos-arm64.dmg": { url: `${REL}/SafeLinkHub-Agent-macOS-arm64.dmg`, type: "application/x-apple-diskimage", name: "SafeLinkHub-Agent-macOS-arm64.dmg" },
  "macos-x64.dmg": { url: `${REL}/SafeLinkHub-Agent-macOS-x64.dmg`, type: "application/x-apple-diskimage", name: "SafeLinkHub-Agent-macOS-x64.dmg" },
  "windows-setup.exe": { url: `${REL}/SafeLinkHub-Agent-Setup.exe`, type: "application/vnd.microsoft.portable-executable", name: "SafeLinkHub-Agent-Setup.exe" },
  // Servi en ligne (pas en pièce jointe) pour `curl … | bash`.
  "install-macos.sh": { url: `${RAW}/install-macos.sh`, type: "text/x-shellscript; charset=utf-8", name: "install-macos.sh", inline: true },
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const entry = FILES[file];
  if (!entry) return new Response("Fichier inconnu.", { status: 404 });

  const upstream = await fetch(entry.url, { cache: "no-store", redirect: "follow" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Installable indisponible pour le moment. Réessayez dans quelques minutes.", { status: 502 });
  }

  const headers = new Headers({
    "content-type": entry.type,
    "content-disposition": `${entry.inline ? "inline" : "attachment"}; filename="${entry.name}"`,
    "cache-control": "public, max-age=300",
  });
  const len = upstream.headers.get("content-length");
  if (len) headers.set("content-length", len);
  return new Response(upstream.body, { headers });
}
