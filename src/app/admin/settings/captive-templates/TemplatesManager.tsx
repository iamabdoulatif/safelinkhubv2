"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Package, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  deleteCaptiveTemplate,
  duplicateCaptiveTemplate,
  importSafelinkhubDefaultPackage,
  importYahyaWifiPackage,
  setDefaultCaptiveTemplate,
} from "@/lib/captive-templates/actions";
import CaptivePreview from "./CaptivePreview";
import PackagePreview from "./PackagePreview";
import TemplateEditor, { type CaptiveTemplateRow } from "./TemplateEditor";
import PackageBrandingEditor from "./PackageBrandingEditor";

export default function TemplatesManager({
  templates,
}: {
  templates: CaptiveTemplateRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CaptiveTemplateRow | null | "new">(null);
  const [editingBranding, setEditingBranding] = useState<CaptiveTemplateRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Vos modèles</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await importSafelinkhubDefaultPackage();
                if (res?.error) setError(res.error);
                else router.refresh();
              })
            }
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Package className="h-4 w-4" />
            Importer le portail SafeLinkHub
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await importYahyaWifiPackage();
                if (res?.error) setError(res.error);
                else router.refresh();
              })
            }
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Package className="h-4 w-4" />
            Importer le portail Yahya WiFi
          </button>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Nouveau modèle
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {templates.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
          Aucun modèle pour le moment. Créez-en un pour personnaliser la page
          que vos clients voient en se connectant au Wi-Fi.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="h-40 overflow-hidden rounded-lg bg-slate-50">
                {t.templateType === "package" ? (
                  <PackagePreview files={t.packageFiles} />
                ) : (
                  <div
                    className="pointer-events-none h-[400px] w-[320px] origin-top-left scale-[0.4]"
                    aria-hidden
                  >
                    <CaptivePreview
                      data={{
                        logoUrl: t.logoUrl ?? "",
                        primaryColor: t.primaryColor,
                        backgroundColor: t.backgroundColor,
                        title: t.title,
                        subtitle: t.subtitle,
                        buttonLabel: t.buttonLabel,
                        voucherFieldLabel: t.voucherFieldLabel,
                        termsText: t.termsText ?? "",
                        footerText: t.footerText ?? "",
                        mobileMoneyEnabled: t.mobileMoneyEnabled,
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  {t.name}
                  {t.isDefault && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      <Star className="h-3 w-3" />
                      Par défaut
                    </span>
                  )}
                  {t.templateType === "package" && (
                    <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                      <Package className="h-3 w-3" />
                      Package
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {t.templateType === "package" ? (
                  <button
                    type="button"
                    onClick={() => setEditingBranding(t)}
                    className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Coordonnées
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Modifier
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await duplicateCaptiveTemplate(t.id);
                      if (res?.error) setError(res.error);
                      else router.refresh();
                    })
                  }
                  className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Dupliquer
                </button>
                {!t.isDefault && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await setDefaultCaptiveTemplate(t.id);
                        if (res?.error) setError(res.error);
                        else router.refresh();
                      })
                    }
                    className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Star className="h-3.5 w-3.5" />
                    Par défaut
                  </button>
                )}

                {confirmDeleteId === t.id ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await deleteCaptiveTemplate(t.id);
                          if (res?.error) {
                            setError(res.error);
                            setConfirmDeleteId(null);
                          } else {
                            router.refresh();
                          }
                        })
                      }
                      className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(t.id)}
                    className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {editingBranding && (
        <PackageBrandingEditor
          template={editingBranding}
          onClose={() => setEditingBranding(null)}
        />
      )}
    </div>
  );
}
