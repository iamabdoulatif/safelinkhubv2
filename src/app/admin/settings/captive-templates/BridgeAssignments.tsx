"use client";

import { useTransition } from "react";
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

  if (bridges.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-slate-700">
        Assignation par bridge
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Choisissez quel modèle s&apos;affiche pour chaque bridge avec hotspot
        activé. Sans choix explicite, le modèle marqué &quot;Par défaut&quot;
        est utilisé.
      </p>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-3">Bridge</th>
              <th className="px-4 py-3">Routeur</th>
              <th className="px-4 py-3">Modèle</th>
            </tr>
          </thead>
          <tbody>
            {bridges.map((b) => (
              <tr key={b.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-700">{b.name}</td>
                <td className="px-4 py-3 text-slate-500">{b.routerName}</td>
                <td className="px-4 py-3">
                  <select
                    defaultValue={b.captiveTemplateId ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      startTransition(async () => {
                        await assignTemplateToBridge(b.id, e.target.value || null);
                        router.refresh();
                      })
                    }
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
