"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTemplateToBridge } from "@/lib/captive-templates/actions";

type Bridge = {
  id: string;
  name: string;
  routerName: string;
  captiveTemplateId: string | null;
};
type Template = { id: string; name: string; isDefault: boolean };

export default function BridgeAssignments({
  bridges,
  templates,
}: {
  bridges: Bridge[];
  templates: Template[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  if (bridges.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-ink">
        Assignation par bridge
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Choisissez quel modèle s&apos;affiche pour chaque bridge avec hotspot
        activé. Sans choix explicite, le modèle marqué &quot;Par défaut&quot;
        est utilisé.
      </p>

      <div className="mt-3 overflow-hidden border-2 border-line bg-paper">
        <div className="table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line-soft text-xs font-medium text-ink-soft">
            <tr>
              <th className="px-4 py-3">Bridge</th>
              <th className="px-4 py-3">Routeur</th>
              <th className="px-4 py-3">Modèle</th>
            </tr>
          </thead>
          <tbody>
            {bridges.map((b) => (
              <tr key={b.id} className="border-b border-line-soft last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{b.name}</td>
                <td className="px-4 py-3 text-ink-soft">{b.routerName}</td>
                <td className="px-4 py-3">
                  <select
                    defaultValue={b.captiveTemplateId ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      startTransition(async () => {
                        const res = await assignTemplateToBridge(b.id, e.target.value || null);
                        if (res?.error) {
                          setFeedback((f) => ({ ...f, [b.id]: `Erreur : ${res.error}` }));
                        } else if (res && "ssid" in res) {
                          const failedCount = "failed" in res && res.failed ? res.failed.length : 0;
                          const msg =
                            failedCount > 0
                              ? `Portail installé sous le nom "${res.ssid}" — ${res.uploaded} fichier(s) ok, ${failedCount} échec(s).`
                              : `Portail installé et renommé "${res.ssid}".`;
                          setFeedback((f) => ({ ...f, [b.id]: msg }));
                        } else {
                          setFeedback((f) => {
                            const next = { ...f };
                            delete next[b.id];
                            return next;
                          });
                        }
                        router.refresh();
                      })
                    }
                    className="rounded-md border border-line-soft px-2 py-1.5 text-sm focus:border-line-soft focus:outline-none"
                  >
                    <option value="">
                      Par défaut
                      {templates.find((t) => t.isDefault)
                        ? ` (${templates.find((t) => t.isDefault)!.name})`
                        : ""}
                    </option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {feedback[b.id] && (
                    <p className="mt-1 text-xs text-ink-soft">{feedback[b.id]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
