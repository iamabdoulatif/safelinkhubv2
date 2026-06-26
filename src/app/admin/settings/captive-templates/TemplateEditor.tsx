"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  createCaptiveTemplate,
  updateCaptiveTemplate,
} from "@/lib/captive-templates/actions";
import CaptivePreview, { type CaptivePreviewData } from "./CaptivePreview";

export type CaptiveTemplateRow = {
  id: string;
  name: string;
  isDefault: boolean;
  logoUrl: string | null;
  backgroundUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  voucherFieldLabel: string;
  termsText: string | null;
  footerText: string | null;
  mobileMoneyEnabled: boolean;
  templateType: string;
  packageSupportWhatsapp?: string | null;
  packageSupportPhone?: string | null;
  // jsonb column — drizzle infers `unknown`; cast to Vendor[] where consumed.
  packageVendors?: unknown;
};

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />
    </div>
  );
}

export default function TemplateEditor({
  template,
  onClose,
}: {
  template: CaptiveTemplateRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(template);
  const action = isEdit
    ? updateCaptiveTemplate.bind(null, template!.id)
    : createCaptiveTemplate;
  const [state, formAction, pending] = useActionState(action, undefined);

  const [mobileMoneyEnabled, setMobileMoneyEnabled] = useState(
    template?.mobileMoneyEnabled ?? false,
  );
  const [form, setForm] = useState({
    name: template?.name ?? "",
    logoUrl: template?.logoUrl ?? "",
    backgroundUrl: template?.backgroundUrl ?? "",
    primaryColor: template?.primaryColor ?? "#0f172a",
    backgroundColor: template?.backgroundColor ?? "#f8fafc",
    title: template?.title ?? "Bienvenue sur le réseau Wi-Fi",
    subtitle: template?.subtitle ?? "Entrez votre code d'accès pour vous connecter.",
    buttonLabel: template?.buttonLabel ?? "Se connecter",
    voucherFieldLabel: template?.voucherFieldLabel ?? "Code d'accès",
    termsText: template?.termsText ?? "",
    footerText: template?.footerText ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (state?.success) {
    onClose();
    router.refresh();
  }

  const previewData: CaptivePreviewData = { ...form, mobileMoneyEnabled };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? "Modifier le modèle" : "Nouveau modèle de portail captif"}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-2">
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                {state.error}
              </p>
            )}

            <Field
              label="Nom du modèle"
              name="name"
              value={form.name}
              onChange={(v) => set("name", v)}
              placeholder="Modèle par défaut"
            />
            <Field
              label="URL du logo"
              name="logoUrl"
              value={form.logoUrl}
              onChange={(v) => set("logoUrl", v)}
              placeholder="https://..."
            />
            <Field
              label="URL d'image de fond (optionnel)"
              name="backgroundUrl"
              value={form.backgroundUrl}
              onChange={(v) => set("backgroundUrl", v)}
              placeholder="https://..."
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Couleur principale
                </label>
                <input
                  name="primaryColor"
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => set("primaryColor", e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Couleur de fond
                </label>
                <input
                  name="backgroundColor"
                  type="color"
                  value={form.backgroundColor}
                  onChange={(e) => set("backgroundColor", e.target.value)}
                  className="h-10 w-full rounded-md border border-slate-300"
                />
              </div>
            </div>

            <Field
              label="Titre"
              name="title"
              value={form.title}
              onChange={(v) => set("title", v)}
            />
            <Field
              label="Sous-titre"
              name="subtitle"
              value={form.subtitle}
              onChange={(v) => set("subtitle", v)}
            />
            <Field
              label="Libellé du bouton"
              name="buttonLabel"
              value={form.buttonLabel}
              onChange={(v) => set("buttonLabel", v)}
            />
            <Field
              label="Libellé du champ de code"
              name="voucherFieldLabel"
              value={form.voucherFieldLabel}
              onChange={(v) => set("voucherFieldLabel", v)}
            />
            <Field
              label="Conditions d'utilisation (optionnel)"
              name="termsText"
              value={form.termsText}
              onChange={(v) => set("termsText", v)}
            />
            <Field
              label="Texte de pied de page (optionnel)"
              name="footerText"
              value={form.footerText}
              onChange={(v) => set("footerText", v)}
            />

            <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                name="mobileMoneyEnabled"
                checked={mobileMoneyEnabled}
                onChange={(e) => setMobileMoneyEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Afficher les boutons de paiement mobile money (Wave, Orange
              Money, Moov Money) sur le portail
            </label>
            <p className="text-[11px] text-slate-400">
              Maquette d&apos;interface uniquement pour l&apos;instant — voir{" "}
              <a
                href="/admin/settings/payment-gateways"
                className="underline"
              >
                Passerelles de paiement
              </a>{" "}
              pour connecter les vraies clés API.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {pending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Aperçu</p>
            <div className="h-[480px]">
              <CaptivePreview data={previewData} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
