"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Valeur en police mono avec bouton Copier (identifiant à transmettre au support). */
export default function CopyValue({ value }: { value: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="truncate rounded-md bg-clay px-2 py-1 font-mono text-[13px] text-ink">{value}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopie(true);
            setTimeout(() => setCopie(false), 2000);
          } catch {
            /* presse-papiers refusé : la valeur reste sélectionnable */
          }
        }}
        aria-label={copie ? "Copié" : "Copier l'identifiant"}
        className="btn btn-sm btn-ghost w-8 shrink-0 px-0"
      >
        {copie ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-ok" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
