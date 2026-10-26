"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CreditCard, Loader2, Trash2 } from "lucide-react";
import { installAutomaticPayment, uninstallAutomaticPayment } from "@/lib/mikrotik/actions";

export default function AutomaticPaymentPanel({ routerId }: { routerId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(action: "install" | "uninstall") {
    if (action === "uninstall" && !window.confirm("Désinstaller le paiement automatique de ce routeur ? Le hotspot et les tickets resteront actifs.")) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = action === "install"
        ? await installAutomaticPayment(routerId)
        : await uninstallAutomaticPayment(routerId);
      if ("error" in result) setError(result.error ?? "L’opération a échoué.");
      else setMessage(result.message ?? "Opération terminée.");
    });
  }

  return (
    <section className="rounded-xl border border-line bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard aria-hidden="true" className="h-5 w-5 text-brand-deep" />
            <h3 className="font-display text-base font-bold text-ink">Paiement automatique</h3>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
            Active la voie de paiement RouterOS sur un hotspot existant, même si l’auto-setup SafeLinkHub n’a jamais été exécuté.
            L’installation ne modifie pas la topologie du routeur.
          </p>
        </div>
        <span className="rounded-full bg-clay px-2.5 py-1 text-xs font-semibold text-ink-soft">Routeur en ligne requis</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => run("install")} disabled={pending} className="btn btn-md btn-primary inline-flex items-center gap-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          Installer le paiement
        </button>
        <button type="button" onClick={() => run("uninstall")} disabled={pending} className="btn btn-md btn-secondary inline-flex items-center gap-2">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Désinstaller
        </button>
      </div>

      {message && <p role="status" className="mt-4 text-sm font-semibold text-ok">{message}</p>}
      {error && <p role="alert" className="mt-4 text-sm font-semibold text-err">{error}</p>}
    </section>
  );
}
