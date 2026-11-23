"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { updatePackageTemplateBranding } from "@/lib/captive-templates/actions";
import type { CaptiveTemplateRow } from "./TemplateEditor";

type Vendor = { name: string; location: string; phone: string };

// Redimensionne l'image choisie côté client (le portail est servi hors ligne
// depuis le routeur et le bandeau est réinjecté dans login.html à chaque
// chargement — on garde l'image légère). Max 800px de large, JPEG qualité 0.82.
async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxW = 800;
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

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
  const [backgroundImage, setBackgroundImage] = useState(template.packageBackgroundImage ?? "");

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setBackgroundImage(await downscaleToDataUrl(file));
    } catch {
      setError("Impossible de lire cette image.");
    }
  }

  function updateVendor(index: number, patch: Partial<Vendor>) {
    setVendors((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function save() {
    startTransition(async () => {
      const res = await updatePackageTemplateBranding(template.id, {
        supportWhatsapp,
        supportPhone,
        vendors,
        backgroundImage: backgroundImage || null,
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
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">
            Coordonnées du portail — {template.name}
          </h3>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink-soft">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-ink">
            Image de fond (bandeau)
          </label>
          {backgroundImage ? (
            <div className="relative overflow-hidden rounded-lg border border-line-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={backgroundImage} alt="" className="max-h-40 w-full object-cover" />
              <button
                type="button"
                onClick={() => setBackgroundImage("")}
                className="absolute right-2 top-2 rounded-lg bg-black/55 p-1.5 text-white hover:bg-black/70"
                aria-label="Retirer l'image"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-soft px-3 py-6 text-sm text-ink-soft hover:bg-clay">
              <ImagePlus className="h-4 w-4" />
              Choisir une image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickImage(e.target.files?.[0])}
              />
            </label>
          )}
          <p className="mt-1 text-xs text-ink-soft">
            Affichée en haut du portail. Redimensionnée automatiquement pour rester légère.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              WhatsApp support
            </label>
            <input
              value={supportWhatsapp}
              onChange={(e) => setSupportWhatsapp(e.target.value)}
              placeholder="+225 00 00 00 00 00"
              className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Téléphone support
            </label>
            <input
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="+225 00 00 00 00 00"
              className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-ink"
            />
          </div>
          <p className="text-xs text-ink-soft">
            Laissez vide pour ne pas afficher ce moyen de contact sur la page de connexion.
          </p>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink">Vendeurs agréés</h4>
            <button
              type="button"
              onClick={() => setVendors((prev) => [...prev, { name: "", location: "", phone: "" }])}
              className="flex items-center gap-1 rounded-lg border border-line-soft px-2 py-1 text-xs font-medium text-ink-soft hover:bg-clay"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>

          {vendors.length === 0 ? (
            <p className="mt-2 text-xs text-ink-soft">
              Aucun vendeur — la section &quot;Retrouver mon code&quot; restera vide.
            </p>
          ) : (
            <div className="mt-2 space-y-3">
              {vendors.map((v, i) => (
                <div key={i} className="rounded-lg border border-line-soft p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <input
                        value={v.name}
                        onChange={(e) => updateVendor(i, { name: e.target.value })}
                        placeholder="Nom du vendeur"
                        className="w-full rounded-lg border border-line-soft px-2 py-1.5 text-sm placeholder:text-ink-soft focus:border-ink"
                      />
                      <input
                        value={v.location}
                        onChange={(e) => updateVendor(i, { location: e.target.value })}
                        placeholder="Quartier / ville"
                        className="w-full rounded-lg border border-line-soft px-2 py-1.5 text-sm placeholder:text-ink-soft focus:border-ink"
                      />
                      <input
                        value={v.phone}
                        onChange={(e) => updateVendor(i, { phone: e.target.value })}
                        placeholder="+225 07 00 00 00 00"
                        className="w-full rounded-lg border border-line-soft px-2 py-1.5 text-sm placeholder:text-ink-soft focus:border-ink"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setVendors((prev) => prev.filter((_, idx) => idx !== i))}
                      className="rounded-lg border border-err p-1.5 text-err hover:bg-err-soft"
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
            className="btn btn-sm btn-outline"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="btn btn-sm btn-secondary"
          >
            {pending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
