"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Package, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  deleteCaptiveTemplate,
  duplicateCaptiveTemplate,
  importSafelinkhubDefaultPackage,
  importYahyaWifiPackage,
  setDefaultCaptiveTemplate,
} from "@/lib/captive-templates/actions";
import { ButtonLoader } from "@/components/FancyLoader";
import CaptivePreview from "./CaptivePreview";
import ImportPortalButton from "./ImportPortalButton";
import PackagePreview from "./PackagePreview";
import TemplateEditor, { type CaptiveTemplateRow } from "./TemplateEditor";
import PackageBrandingEditor from "./PackageBrandingEditor";

export default function TemplatesManager({
  templates,
}: {
  templates: CaptiveTemplateRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retour = searchParams.get("retour");

  const [editing, setEditing] = useState<CaptiveTemplateRow | null | "new">(null);
  const [editingBranding, setEditingBranding] = useState<CaptiveTemplateRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function goBackIfRetour() {
    if (retour) {
      router.push(`/admin/settings/router-setup?router=${encodeURIComponent(retour)}`);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Vos modèles</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ImportPortalButton />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await importSafelinkhubDefaultPackage();
                if (res?.error) setError(res.error);
                else goBackIfRetour();
              })
            }
            className="flex items-center gap-1.5 rounded-md border border-line-soft px-3 py-1.5 text-sm font-medium text-ink hover:bg-clay"
          >
            {pending ? <ButtonLoader size="sm" color="currentColor" /> : <Package className="h-4 w-4" />}
            Importer le portail SafeLinkHub
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await importYahyaWifiPackage();
                if (res?.error) setError(res.error);
                else goBackIfRetour();
              })
            }
            className="flex items-center gap-1.5 rounded-md border border-line-soft px-3 py-1.5 text-sm font-medium text-ink hover:bg-clay"
          >
            {pending ? <ButtonLoader size="sm" color="currentColor" /> : <Package className="h-4 w-4" />}
            Importer le portail SafeLink Africa
          </button>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3A362F]"
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
        <p className="mt-4 rounded-md border border-dashed border-line-soft px-4 py-10 text-center text-sm text-ink-soft">
          Aucun modèle pour le moment. Créez-en un pour personnaliser la page
          que vos clients voient en se connectant au Wi-Fi.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="border-2 border-line bg-paper p-3">
              <div className="h-40 overflow-hidden rounded-lg bg-clay">
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
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  {t.name}
                  {t.isDefault && (
                    <span className="flex items-center gap-1 rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-warn">
                      <Star className="h-3 w-3" />
                      Par défaut
                    </span>
                  )}
                  {t.templateType === "package" && (
                    <span className="flex items-center gap-1 rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-brand-deep">
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
                    className="flex items-center gap-1 rounded-md border border-line-soft px-2 py-1 text-xs font-medium text-ink-soft hover:bg-clay"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Coordonnées
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="flex items-center gap-1 rounded-md border border-line-soft px-2 py-1 text-xs font-medium text-ink-soft hover:bg-clay"
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
                  className="flex items-center gap-1 rounded-md border border-line-soft px-2 py-1 text-xs font-medium text-ink-soft hover:bg-clay"
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
                        else goBackIfRetour();
                      })
                    }
                    className="flex items-center gap-1 rounded-md border border-line-soft px-2 py-1 text-xs font-medium text-ink-soft hover:bg-clay"
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
                      className="rounded-md border border-line-soft px-2 py-1 text-xs font-medium text-ink-soft hover:bg-clay"
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
