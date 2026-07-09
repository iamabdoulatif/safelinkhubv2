"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderUp, X } from "lucide-react";
import { importCustomPackageTemplate } from "@/lib/captive-templates/actions";
import type { PackageFile } from "@/lib/captive-templates/package-files";
import { ButtonLoader } from "@/components/FancyLoader";

// Mirrors the server-side allowlist (PORTAL_ALLOWED_EXTENSIONS) so junk
// files (.DS_Store, sources maps, archives…) are dropped client-side
// instead of faisant échouer tout l'import côté serveur.
const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".svg", ".txt"]);
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".avif", ".woff", ".woff2",
]);

function extensionOf(path: string) {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i).toLowerCase();
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Lit le dossier sélectionné (webkitdirectory), retire le nom du dossier
 * racine des chemins, ignore les fichiers cachés et non supportés, et
 * encode chaque fichier en utf8/base64 prêt pour packageFiles.
 */
async function readPortalFolder(fileList: FileList): Promise<{
  folderName: string;
  files: PackageFile[];
  skipped: string[];
}> {
  const files: PackageFile[] = [];
  const skipped: string[] = [];
  let folderName = "";

  for (const file of Array.from(fileList)) {
    const relative = (file.webkitRelativePath || file.name).replaceAll("\\", "/");
    const segments = relative.split("/");
    if (segments.length > 1 && !folderName) folderName = segments[0];
    // Retire le dossier racine ("safelinkhub-gold/login.html" → "login.html").
    const path = segments.length > 1 ? segments.slice(1).join("/") : relative;

    if (path.split("/").some((s) => !s || s.startsWith("."))) {
      skipped.push(relative);
      continue;
    }
    const ext = extensionOf(path);
    if (TEXT_EXTENSIONS.has(ext)) {
      files.push({ path, content: await file.text(), encoding: "utf8" });
    } else if (BINARY_EXTENSIONS.has(ext)) {
      files.push({ path, content: bufferToBase64(await file.arrayBuffer()), encoding: "base64" });
    } else {
      skipped.push(relative);
    }
  }

  return { folderName, files, skipped };
}

export default function ImportPortalButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retour = searchParams.get("retour");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    files: PackageFile[];
    skipped: string[];
  } | null>(null);
  const [result, setResult] = useState<{ substitutions?: string[] } | null>(null);

  async function onFolderSelected(fileList: FileList | null) {
    setError(null);
    setResult(null);
    if (!fileList || fileList.length === 0) return;
    setReading(true);
    try {
      const { folderName, files, skipped } = await readPortalFolder(fileList);
      if (!files.some((f) => f.path === "login.html")) {
        setError(
          "Le dossier sélectionné ne contient pas de login.html à sa racine — ce fichier est indispensable (c'est la page servie par RouterOS).",
        );
        return;
      }
      setDraft({
        name: folderName ? `${folderName} (portail importé)` : "Portail importé",
        files,
        skipped,
      });
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function runImport() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const res = await importCustomPackageTemplate({ name: draft.name.trim(), files: draft.files });
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      setResult({ substitutions: (res as { substitutions?: string[] }).substitutions });
      setDraft(null);
      if (retour) {
        // etape=3 : reprendre directement l'étape « Configuration
        // automatique » d'où venait l'admin, pas le début du wizard.
        router.push(
          `/admin/settings/router-setup?router=${encodeURIComponent(retour)}&etape=3`,
        );
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        // @ts-expect-error — attribut non standard mais supporté par tous
        // les navigateurs modernes pour la sélection de dossiers.
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={(e) => onFolderSelected(e.target.files)}
      />
      <button
        type="button"
        disabled={reading || pending}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-md border border-line-soft px-3 py-1.5 text-sm font-medium text-ink hover:bg-clay disabled:opacity-60"
      >
        {reading || pending ? <ButtonLoader size="sm" color="currentColor" /> : <FolderUp className="h-4 w-4" />}
        Importer un portail personnalisé
      </button>

      {error && (
        <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {result && (
        <div className="w-full rounded-md bg-clay px-3 py-2 text-sm text-ok">
          <p className="font-medium">Portail importé — il est maintenant disponible dans l&apos;auto-setup.</p>
          {result.substitutions && result.substitutions.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-ink-soft">
              {result.substitutions.map((s) => (
                <li key={s}>Automatisé : {s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setDraft(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-portal-title"
            className="max-h-[90dvh] overflow-y-auto w-full max-w-lg rounded-2xl bg-paper p-6"
          >
            <div className="flex items-start justify-between">
              <h2 id="import-portal-title" className="text-lg font-semibold text-ink">
                Importer ce portail
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={pending}
                aria-label="Fermer"
                className="rounded-md p-1 hover:bg-clay"
              >
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>

            <label htmlFor="portal-name" className="mt-4 block text-xs font-medium text-ink-soft">
              Nom du portail
            </label>
            <input
              id="portal-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
            />

            <p className="mt-3 text-sm text-ink-soft">
              {draft.files.length} fichiers seront importés
              {draft.skipped.length > 0 ? ` (${draft.skipped.length} ignorés : fichiers cachés ou non supportés)` : ""}.
            </p>
            <p className="mt-2 rounded-md bg-clay px-3 py-2 text-xs text-ink-soft">
              À l&apos;import, le portail est automatiquement paramétré : nom du Wi-Fi (SSID),
              forfaits et prix synchronisés avec la page Forfaits, numéro de support — puis
              proposé comme choix de portail captif dans l&apos;auto-setup.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={pending}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={runImport}
                disabled={pending || !draft.name.trim()}
                className="flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
              >
                {pending && <ButtonLoader size="sm" color="white" />}
                {pending ? "Import en cours…" : "Importer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
