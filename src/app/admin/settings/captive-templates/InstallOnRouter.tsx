"use client";

// Installation DIRECTE d'un portail « package » sur n'importe quel MikroTik de
// l'org — indépendamment de l'auto-setup, et gratuite. Détecte côté serveur le
// hotspot réellement actif (auto-setup OU configuré à la main) et y pousse les
// fichiers du modèle choisi. Voir installTemplateOnRouter (actions.ts).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { installTemplateOnRouter } from "@/lib/captive-templates/actions";

type RouterOption = { id: string; name: string; status: string };
type TemplateOption = { id: string; name: string; isDefault: boolean };

export default function InstallOnRouter({
  routers,
  templates,
}: {
  routers: RouterOption[];
  templates: TemplateOption[];
}) {
  const navRouter = useRouter();
  const [pending, startTransition] = useTransition();
  const [routerId, setRouterId] = useState(routers[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(
    templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? "",
  );
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function install() {
    if (!routerId || !templateId || pending) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await installTemplateOnRouter(routerId, templateId);
      if (res && "error" in res && res.error) {
        setFeedback({ kind: "err", text: res.error });
        return;
      }
      if (res && "success" in res && res.success) {
        const base = `Portail installé sur le hotspot « ${res.server} » (${res.uploaded} fichiers, SSID ${res.ssid}).`;
        setFeedback(
          "partial" in res && res.partial
            ? {
                kind: "err",
                text: `${base} Mais ${res.failed?.length ?? 0} fichier(s) ont échoué — réessayez.`,
              }
            : { kind: "ok", text: base },
        );
        navRouter.refresh();
      }
    });
  }

  if (templates.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold text-ink">Installer sur un routeur</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Injecte le portail captif directement sur n&apos;importe quel MikroTik connecté —
        indépendamment de l&apos;auto-setup, et gratuitement. Seule condition : un hotspot
        RouterOS actif sur le routeur (créé par l&apos;auto-setup ou à la main).
      </p>

      {routers.length === 0 ? (
        <p className="mt-3 rounded-md border border-line-soft bg-clay px-3 py-2 text-sm text-ink-soft">
          Aucun routeur dans votre organisation — ajoutez-en un d&apos;abord.
        </p>
      ) : (
        <div className="mt-3 border-2 border-line bg-paper p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-ink">Routeur MikroTik</label>
              <select
                value={routerId}
                onChange={(e) => setRouterId(e.target.value)}
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none"
              >
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.status === "online" ? "" : ` — ${r.status}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-ink">Portail à installer</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-ok focus:outline-none"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? " (par défaut)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={install}
              disabled={pending || !routerId || !templateId}
              className="flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-60"
            >
              <UploadCloud className="h-4 w-4" />
              {pending ? "Installation…" : "Installer le portail"}
            </button>
          </div>

          {feedback && (
            <p
              className={`mt-3 rounded-md px-3 py-2 text-sm ${
                feedback.kind === "ok" ? "bg-clay text-ok" : "bg-red-50 text-red-600"
              }`}
            >
              {feedback.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
