"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { updatePackageTemplateBranding } from "@/lib/captive-templates/actions";
import type { CaptiveTemplateRow } from "./TemplateEditor";

type Vendor = { name: string; location: string; phone: string };

/**
 * Lightweight editor for the parts of a "package" (multi-file) hotspot
 * portal that are configurable without touching its bundled HTML/CSS/JS:
 * the support WhatsApp/phone shown in the footer, and the list of
 * "vendeurs agréés" shown under "Retrouver mon code". These get
 * substituted into {{SUPPORT_LINKS_HTML}} / {{VENDORS_HTML}} at fetch
 * time — see package-files.ts.
 */
export default function PackageBrandingEditor({
  template,
  onClose,
}: {
  template: CaptiveTemplateRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supportWhatsapp, setSupportWhatsapp] = useState(template.packageSupportWhatsapp ?? "");
  const [supportPhone, setSupportPhone] = useState(template.packageSupportPhone ?? "");
  const [vendors, setVendors] = useState<Vendor[]>(
    Array.isArray(template.packageVendors) ? (template.packageVendors as Vendor[]) : [],
  );

  function updateVendor(index: number, patch: Partial<Vendor>) {
    setVendors((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function save() {
    startTransition(async () => {
      const res = await updatePackageTemplateBranding(template.id, {
        supportWhatsapp,
        supportPhone,
        vendors,
      });
      if (res?.error) setError(res.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            Coordonnées du portail — {template.name}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              WhatsApp support
            </label>
            <input
              value={supportWhatsapp}
              onChange={(e) => setSupportWhatsapp(e.target.value)}
              placeholder="+225 00 00 00 00 00"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Téléphone support
            </label>
            <input
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="+225 00 00 00 00 00"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
          </div>
          <p className="text-xs text-slate-400">
            Laissez vide pour ne pas afficher ce moyen de contact sur la page de connexion.
          </p>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">Vendeurs agréés</h4>
            <button
              type="button"
              onClick={() => setVendors((prev) => [...prev, { name: "", location: "", phone: "" }])}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>

          {vendors.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              Aucun vendeur — la section &quot;Retrouver mon code&quot; restera vide.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              {vendors.map((v, i) => (
                <div key={i} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <input
                        value={v.name}
                        onChange={(e) => updateVendor(i, { name: e.target.value })}
                        placeholder="Nom du vendeur"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                      />
                      <input
                        value={v.location}
                        onChange={(e) => updateVendor(i, { location: e.target.value })}
                        placeholder="Quartier / ville"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                      />
                      <input
                        value={v.phone}
                        onChange={(e) => updateVendor(i, { phone: e.target.value })}
                        placeholder="+225 07 00 00 00 00"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setVendors((prev) => prev.filter((_, idx) => idx !== i))}
                      className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
