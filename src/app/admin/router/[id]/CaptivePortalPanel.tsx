"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, LayoutTemplate, UploadCloud } from "lucide-react";
import { installRouterPortal, listRouterPortalTemplates } from "@/lib/captive-templates/actions";

type Templates = Extract<Awaited<ReturnType<typeof listRouterPortalTemplates>>, { success: true }>;

/**
 * Portail captif DEPUIS LA PAGE DU ROUTEUR.
 *
 * La page « Portails captifs » n'installe que sur les routeurs de l'org de la
 * session ; un superadmin qui dépanne un routeur client — HSPT-SATA servait le
 * portail RouterOS d'usine — n'avait aucun chemin. Ici, les modèles listés et
 * l'installateur sont ceux de l'organisation DU ROUTEUR : l'admin de l'org y
 * accède sur ses routeurs, le superadmin sur tous. Même installateur, mêmes
 * garanties (forfaits importés, walled-garden, modèle mémorisé).
 */
export default function CaptivePortalPanel({ routerId }: { routerId: string }) {
  const [data, setData] = useState<Templates | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivant = true;
    listRouterPortalTemplates(routerId).then((res) => {
      if (!vivant) return;
      if ("error" in res) return setLoadError(res.error);
      setData(res);
      setTemplateId(res.current?.id ?? res.templates.find((t) => t.isDefault)?.id ?? res.templates[0]?.id ?? "");
    });
    return () => {
      vivant = false;
    };
  }, [routerId]);

  function install() {
    if (!templateId || pending) return;
    setFeedback(null);
    start(async () => {
      const res = await installRouterPortal(routerId, templateId);
      if (!res || ("error" in res && res.error)) {
        setFeedback({ ok: false, text: (res && "error" in res && res.error) || "Échec de l'installation." });
        return;
      }
      if ("success" in res && res.success) {
        const partiel = "partial" in res && res.partial;
        const motif = res.failed?.[0]?.error;
        setFeedback({
          ok: !partiel,
          text:
            `Portail installé sur le hotspot « ${res.server} » (${res.uploaded} fichiers, SSID ${res.ssid}).` +
            ("plansAdopted" in res && res.plansAdopted ? ` ${res.plansAdopted} forfait(s) repris du routeur.` : "") +
            (partiel ? ` Mais ${res.failed?.length ?? 0} fichier(s) ont échoué${motif ? ` (${motif})` : ""} — réessayez.` : ""),
        });
        const installed = data?.templates.find((t) => t.id === templateId) ?? null;
        if (data && installed) setData({ ...data, current: installed });
      }
    });
  }

  return (
    <section className="mb-6 border border-line bg-paper p-5 rounded-xl">
      <div className="flex items-center gap-2">
        <LayoutTemplate className="h-4.5 w-4.5 text-ink" aria-hidden="true" />
        <h2 className="font-display text-base font-bold text-ink">Portail captif</h2>
      </div>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">
        La page que les clients voient en se connectant au Wi-Fi. Modèles de l&apos;organisation de ce
        routeur ; l&apos;installation détecte le serveur hotspot actif, pousse les fichiers, reprend les
        forfaits et pose le walled-garden de paiement.
      </p>

      {loadError && <p className="mt-3 text-sm text-err">{loadError}</p>}

      {data && (
        <>
          <p className="mt-3 text-sm text-ink">
            Actuellement :{" "}
            {data.current ? (
              <span className="font-bold">{data.current.name}</span>
            ) : (
              <span className="font-bold text-warn">aucun modèle SafeLinkHub mémorisé — probablement le portail RouterOS d&apos;usine</span>
            )}
          </p>

          {data.templates.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              Cette organisation n&apos;a aucun portail multi-fichiers. Créez-en un dans Réglages → Portail
              captif (galerie de thèmes, ou import).
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={pending}
                className="min-w-64 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink disabled:opacity-60"
              >
                {data.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? " (par défaut)" : ""}
                    {data.current?.id === t.id ? " — installé" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending || !templateId}
                onClick={install}
                className="inline-flex items-center gap-2 border border-line bg-brand px-4 py-2 text-sm font-bold text-slate-deep transition-colors duration-150 hover:bg-ink hover:text-paper disabled:opacity-60 rounded-full"
              >
                {pending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud aria-hidden="true" className="h-4 w-4" />
                )}
                {data.current?.id === templateId ? "Réinstaller le portail" : "Installer le portail"}
              </button>
            </div>
          )}

          {feedback && (
            <p role="status" className={`mt-3 text-sm ${feedback.ok ? "text-ok" : "text-err"}`}>
              {feedback.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
