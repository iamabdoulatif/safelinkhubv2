"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Clipboard, Copy, RotateCcw, ShieldAlert, X } from "lucide-react";
import {
  cancelRouterReplacement,
  retryRouterReplacement,
  startRouterReplacement,
} from "@/lib/mikrotik/router-recovery-actions";
import { replacementStatusLabel } from "@/lib/mikrotik/router-recovery";

type RecoveryRow = {
  router: { id: string; name: string; status: string; connectionMethod: string; tunnelIp: string | null };
  services: { service: string; publicPort: number }[];
  replacement: {
    id: string;
    status: string;
    error: string | null;
    replacementRouterId: string;
    createdAt: Date;
  } | null;
};

function serviceLabel(service: string) {
  return ({ winbox: "WinBox", webfig: "WebFig", ssh: "SSH / SFTP", mikhmon: "MikHmon" } as Record<string, string>)[service] ?? service;
}

export default function RouterReplacementSection({ rows }: { rows: RecoveryRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [names, setNames] = useState<Record<string, string>>({});
  const [commands, setCommands] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string; command?: string }>, successMessage: string) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setNotice(result.error);
      else {
        if (result.command) setCommands((current) => ({ ...current, latest: result.command! }));
        setNotice(successMessage);
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="border border-line bg-paper p-5 rounded-xl">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-ok" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-ink">Aucun remplacement à traiter</h2>
            <p className="mt-1 text-sm text-ink-soft">Les routeurs connectés apparaîtront ici si leur matériel doit être remplacé.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map(({ router: source, services, replacement }) => {
        const name = names[source.id] ?? `${source.name} — remplacement`;
        const isInProgress = replacement?.status === "installing";
        const needsAction = !replacement || replacement.status === "pending" || replacement.status === "failed";
        return (
          <section
            key={source.id}
            aria-labelledby={`reprise-${source.id}`}
            className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-paper"
          >
            <div className="flex items-start gap-3.5 p-5 sm:p-6">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-clay text-ink"
              >
                <RotateCcw className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`reprise-${source.id}`} className="font-semibold text-ink">
                    Remplacer le matériel
                  </h3>
                  <span className="rounded-full bg-clay px-2 py-0.5 text-xs font-medium text-ink-soft">
                    {source.connectionMethod === "openvpn" ? "OpenVPN" : "WireGuard"}
                  </span>
                  {replacement && (
                    <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                      {replacementStatusLabel(replacement.status, services.some((service) => service.service === "mikhmon"))}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-6 text-ink-soft">
                  Un nouveau MikroTik reprend les accès déjà payés : mêmes ports publics, mêmes durées,
                  aucun second paiement.
                </p>
                {services.length > 0 && (
                  <ul role="list" className="mt-2 flex flex-wrap gap-1.5">
                    {services.map((service) => (
                      <li
                        key={service.service}
                        className="rounded-md border border-line-soft bg-clay/60 px-2 py-0.5 font-mono text-[11px] text-ink"
                      >
                        {serviceLabel(service.service)} :{service.publicPort}
                      </li>
                    ))}
                  </ul>
                )}
                {replacement?.error && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-err">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {replacement.error}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-auto border-t border-line-soft px-5 py-4 sm:px-6">
              {notice && (
                <p role="status" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                  {notice}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                {!replacement && (
                  <div className="min-w-0 flex-1">
                    <label className="text-xs font-medium text-ink-soft" htmlFor={`replacement-${source.id}`}>
                      Nom du nouveau MikroTik
                    </label>
                    <input
                      id={`replacement-${source.id}`}
                      value={name}
                      onChange={(event) => setNames((current) => ({ ...current, [source.id]: event.target.value }))}
                      className="field mt-1"
                    />
                  </div>
                )}
                {needsAction && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => (replacement ? retryRouterReplacement(replacement.id) : startRouterReplacement(source.id, name)),
                        replacement ? "Un nouveau script a été généré." : "Remplacement créé : exécutez le script sur le nouveau MikroTik.",
                      )
                    }
                    className="btn btn-md btn-secondary inline-flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {replacement ? "Régénérer le script" : "Créer le remplacement"}
                  </button>
                )}
                {replacement && !isInProgress && replacement.status !== "completed" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => cancelRouterReplacement(replacement.id), "La reprise a été annulée.")}
                    className="btn btn-md btn-ghost inline-flex items-center justify-center gap-2"
                  >
                    <X className="h-4 w-4" aria-hidden="true" /> Annuler
                  </button>
                )}
              </div>
            </div>

            {commands.latest && (
              <div className="border-t border-line-soft bg-slate-deep p-4 text-white">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/70">
                  <span className="flex items-center gap-1.5">
                    <Clipboard className="h-3.5 w-3.5" aria-hidden="true" /> Script à coller dans le Terminal MikroTik
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(commands.latest)}
                    className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-white hover:bg-white/20"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" /> Copier
                  </button>
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-white/90">
                  {commands.latest}
                </pre>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
