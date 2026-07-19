"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { importCsvTickets, importMikhmonTickets } from "@/lib/vouchers/actions";
import { matchPackageForProfile, parseMikhmonVoucherCsv } from "@/lib/vouchers/csv-import";

type RouterOption = { id: string; name: string; status: string };
type PackageOption = { id: string; durationValue: number; durationUnit: string };
type Mode = "mikhmon" | "csv";
type CsvPreview =
  | { error: string }
  | {
      validRows: number;
      invalidRows: number;
      unmatchedProfiles: number;
      sample: { username: string; profileName: string | null; comment: string | null }[];
    };

export default function ImportTicketsModal({
  routers,
  packages,
}: {
  routers: RouterOption[];
  packages: PackageOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("mikhmon");
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mikhmonState, mikhmonAction, mikhmonPending] = useActionState(
    importMikhmonTickets,
    undefined,
  );
  const [csvState, csvAction, csvPending] = useActionState(importCsvTickets, undefined);
  const state = mode === "csv" ? csvState : mikhmonState;
  const formAction = mode === "csv" ? csvAction : mikhmonAction;
  const pending = mode === "csv" ? csvPending : mikhmonPending;

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [open]);

  async function previewCsv(file: File | null) {
    if (!file) {
      setCsvPreview(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setCsvPreview({ error: "Le fichier dépasse la limite de 2 Mo." });
      return;
    }

    const parsed = parseMikhmonVoucherCsv(await file.text());
    if (parsed.rows.length === 0) {
      setCsvPreview({ error: parsed.issues[0]?.message ?? "Aucun ticket lisible dans ce fichier." });
      return;
    }
    setCsvPreview({
      validRows: parsed.rows.length,
      invalidRows: parsed.issues.length,
      unmatchedProfiles: parsed.rows.filter(
        (row) => row.profileName && !matchPackageForProfile(row.profileName, packages),
      ).length,
      sample: parsed.rows.slice(0, 3).map((row) => ({
        username: row.username,
        profileName: row.profileName,
        comment: row.comment,
      })),
    });
  }

  const mikhmonSummary =
    mikhmonState?.success && mode === "mikhmon"
      ? [
          mikhmonState.imported > 0 ? `${mikhmonState.imported} importé(s)` : null,
          mikhmonState.adopted > 0 ? `${mikhmonState.adopted} zone(s) rattachée(s)` : null,
          mikhmonState.alreadyTracked > 0 ? `${mikhmonState.alreadyTracked} déjà suivi(s)` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Aucun nouveau ticket à importer."
      : "";
  const csvSummary =
    csvState?.success && mode === "csv"
      ? [
          csvState.imported > 0 ? `${csvState.imported} importé(s)` : null,
          csvState.alreadyTracked > 0 ? `${csvState.alreadyTracked} déjà suivi(s)` : null,
          csvState.inTrash > 0 ? `${csvState.inTrash} dans la corbeille` : null,
          csvState.unmatchedProfiles > 0
            ? `${csvState.unmatchedProfiles} profil(s) non associé(s)`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Aucun nouveau ticket à importer."
      : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-sm bg-brand px-4 py-2 text-sm font-bold text-ink hover:bg-paper"
      >
        <Upload className="h-4 w-4" />
        Importer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer la modale"
            className="absolute inset-0 cursor-default bg-black/60"
            onClick={() => setOpen(false)}
          />
          <form
            action={formAction}
            className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto border-2 border-line bg-paper"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-tickets-title"
          >
            <header className="flex items-start justify-between gap-4 bg-ink px-5 py-5 text-paper md:px-6">
              <div>
                <div className="flex items-center gap-2 text-brand">
                  <span className="h-2 w-2 bg-brand" />
                  <span className="text-xs font-bold tracking-[0.16em]">ARRIVÉE DES TICKETS</span>
                </div>
                <h2 id="import-tickets-title" className="mt-2 font-display text-2xl font-black">
                  Importer dans la station
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
                className="rounded-sm border border-paper/30 p-2 text-paper hover:border-brand hover:bg-brand hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid grid-cols-2 border-b-2 border-line">
              <button
                type="button"
                onClick={() => setMode("mikhmon")}
                className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold ${
                  mode === "mikhmon" ? "bg-brand text-ink" : "bg-paper text-ink-soft hover:bg-clay"
                }`}
              >
                <Database className="h-4 w-4" />
                Depuis MikHmon
              </button>
              <button
                type="button"
                onClick={() => setMode("csv")}
                className={`flex items-center justify-center gap-2 border-l-2 border-line px-4 py-3 text-sm font-bold ${
                  mode === "csv" ? "bg-brand text-ink" : "bg-paper text-ink-soft hover:bg-clay"
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Fichier CSV
              </button>
            </div>

            <div className="p-5 md:p-6">
              {state?.error && (
                <div className="mb-5 flex items-start gap-2 border border-err/30 bg-err-soft px-3 py-2 text-sm text-err" aria-live="polite">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {state.error}
                </div>
              )}
              {state?.success && (
                <div className="mb-5 flex items-start gap-2 border border-ok/30 bg-clay px-3 py-2 text-sm text-ok" aria-live="polite">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-bold">Import terminé</p>
                    <p>{mode === "csv" ? csvSummary : mikhmonSummary}</p>
                    {mode === "mikhmon" && mikhmonState?.success && mikhmonState.routerErrors.length > 0 && (
                      <p className="mt-1 text-xs text-warn">Incidents : {mikhmonState.routerErrors.join(" ; ")}</p>
                    )}
                  </div>
                </div>
              )}

              {mode === "mikhmon" ? (
                <div className="space-y-5">
                  <p className="max-w-xl text-sm leading-6 text-ink-soft">
                    Analyse directement les utilisateurs Hotspot du ou des routeurs cochés. Les
                    tickets déjà suivis sont ignorés et les mêmes codes peuvent être rattachés à
                    plusieurs zones.
                  </p>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-ink">Zones WiFi à scanner</label>
                    {routers.length === 0 ? (
                      <p className="border border-line-soft px-3 py-2 text-sm text-ink-soft">Aucun routeur disponible.</p>
                    ) : (
                      <div className="max-h-48 space-y-1 overflow-y-auto border border-line-soft bg-clay p-2">
                        {routers.map((router, index) => (
                          <label key={router.id} className="flex items-center gap-2 bg-paper px-3 py-2 text-sm hover:bg-brand/20">
                            <input type="checkbox" name="routerIds" value={router.id} defaultChecked={index === 0} />
                            <span className="font-medium text-ink">{router.name}</span>
                            {router.status !== "online" && <span className="text-xs text-ink-soft">(hors ligne)</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-bold text-ink">
                      Étiquette <span className="font-normal text-ink-soft">(optionnelle)</span>
                    </label>
                    <input
                      name="note"
                      placeholder="ex : import MikHmon juillet"
                      className="w-full border border-line-soft bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-brand"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <p className="max-w-xl text-sm leading-6 text-ink-soft">
                    Adopte un export MikHmon existant sans créer ni modifier d&apos;utilisateur
                    MikroTik. Colonnes reconnues : Username, Password, Profile, Time Limit, Data
                    Limit, Comment.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-bold text-ink">Routeur source</label>
                      <select
                        name="routerId"
                        required
                        defaultValue=""
                        className="w-full border border-line-soft bg-paper px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-brand"
                      >
                        <option value="" disabled>Choisir le routeur</option>
                        {routers.map((router) => (
                          <option key={router.id} value={router.id}>{router.name}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-ink-soft">Un export CSV provient d&apos;un seul routeur.</p>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold text-ink">Fichier CSV</label>
                      <label className="flex cursor-pointer items-center gap-3 border-2 border-dashed border-line-soft bg-clay px-3 py-3 text-sm text-ink hover:border-ink hover:bg-brand/20">
                        <FileSpreadsheet className="h-5 w-5 shrink-0 text-brand-deep" />
                        <span>Choisir un export (2 Mo maximum)</span>
                        <input
                          name="voucherCsv"
                          type="file"
                          accept=".csv,text/csv"
                          required
                          className="sr-only"
                          onChange={(event) => void previewCsv(event.currentTarget.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  </div>

                  {csvPreview && (
                    <section className="border-2 border-line bg-paper">
                      {"error" in csvPreview ? (
                        <div className="flex items-center gap-2 bg-err-soft px-4 py-3 text-sm text-err">
                          <AlertCircle className="h-4 w-4" />
                          {csvPreview.error}
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 divide-x divide-line-soft border-b border-line-soft bg-clay text-center">
                            <div className="px-2 py-3"><strong className="block font-mono text-xl text-ink">{csvPreview.validRows}</strong><span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">prêts</span></div>
                            <div className="px-2 py-3"><strong className="block font-mono text-xl text-ink">{csvPreview.invalidRows}</strong><span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">ignorés</span></div>
                            <div className="px-2 py-3"><strong className="block font-mono text-xl text-warn">{csvPreview.unmatchedProfiles}</strong><span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">à associer</span></div>
                          </div>
                          <div className="divide-y divide-line-soft">
                            {csvPreview.sample.map((row) => (
                              <div key={row.username} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2 text-sm">
                                <div><span className="font-mono font-bold text-ink">{row.username}</span>{row.comment && <span className="ml-2 text-xs text-ink-soft">{row.comment}</span>}</div>
                                <span className="text-xs font-bold text-brand-deep">{row.profileName ?? "Sans profil"}</span>
                              </div>
                            ))}
                          </div>
                          {csvPreview.unmatchedProfiles > 0 && (
                            <p className="flex items-center gap-2 border-t border-line-soft px-4 py-3 text-xs text-warn">
                              <TriangleAlert className="h-4 w-4" />
                              Les profils non associés sont conservés mais sans forfait SafeLinkHub.
                            </p>
                          )}
                        </>
                      )}
                    </section>
                  )}
                </div>
              )}

              <footer className="mt-7 flex flex-wrap justify-end gap-2 border-t border-line-soft pt-5">
                <button type="button" onClick={() => setOpen(false)} className="border border-line-soft px-4 py-2 text-sm font-bold text-ink hover:bg-clay">
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={pending || routers.length === 0 || (mode === "csv" && Boolean(csvPreview && "error" in csvPreview))}
                  className="inline-flex items-center gap-2 bg-ink px-4 py-2 text-sm font-bold text-paper hover:bg-brand hover:text-ink disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {pending ? "Import en cours..." : "Importer les tickets"}
                </button>
              </footer>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
