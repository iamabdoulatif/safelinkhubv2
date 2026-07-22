"use client";

import { Archive, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveImportedVouchers } from "@/lib/vouchers/actions";

export default function ArchiveImportedButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (count === 0 && !message) return null;

  function archiveImported() {
    if (
      !window.confirm(
        `Retirer ${count.toLocaleString("fr-FR")} ticket(s) importé(s) de l'inventaire SaaS ?\n\nLes codes restent sur le MikroTik. Ils seront restaurables depuis la corbeille.`,
      )
    ) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await archiveImportedVouchers();
      if ("error" in result) {
        setMessage(result.error ?? "Archivage impossible.");
        return;
      }
      setMessage(
        result.archived === 0
          ? "Aucun ticket importé actif."
          : `${result.archived.toLocaleString("fr-FR")} ticket(s) retiré(s) de l'inventaire. Les codes MikroTik sont conservés.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={archiveImported}
        disabled={pending || count === 0}
        title="Archive uniquement dans SafeLinkHub, sans supprimer les utilisateurs MikroTik"
        className="inline-flex items-center gap-2 rounded-sm border border-paper/40 bg-paper/10 px-3 py-2 text-sm font-bold text-paper transition-colors hover:border-brand hover:bg-brand hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
        Retirer les importés ({count})
      </button>
      {message && <span className="max-w-xs text-xs text-paper/80">{message}</span>}
    </div>
  );
}
