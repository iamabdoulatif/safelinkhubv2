"use client";

import { useRef, useState } from "react";
import { ScanLine, Loader2 } from "lucide-react";
import type { MikrotikLabel } from "@/lib/mikrotik/label-parse";

/**
 * Bouton « Scanner l'étiquette » : ouvre la caméra arrière du téléphone
 * (`capture="environment"`), envoie la photo à /api/router/label-scan (OCR
 * Textract côté serveur) et remonte les champs parsés au formulaire parent.
 *
 * L'utilisateur VÉRIFIE ensuite les champs pré-remplis avant d'enregistrer —
 * l'OCR peut confondre O/0, I/1 sur un mot de passe.
 */
export default function LabelScanButton({
  onResult,
}: {
  onResult: (label: MikrotikLabel) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/router/label-scan", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        label?: MikrotikLabel;
        error?: string;
      };
      if (!res.ok || !data.label) {
        setError(data.error ?? "Échec du scan. Réessayez.");
        return;
      }
      if (!data.label.password && !data.label.serial) {
        setError("Étiquette illisible. Cadrez bien le texte, sans reflet.");
        return;
      }
      onResult(data.label);
    } catch {
      setError("Réseau indisponible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = ""; // permet de re-scanner le même fichier
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-soft bg-clay px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-60"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <ScanLine aria-hidden="true" className="h-4 w-4" />
        )}
        {busy ? "Lecture de l'étiquette…" : "Scanner l'étiquette (caméra)"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
