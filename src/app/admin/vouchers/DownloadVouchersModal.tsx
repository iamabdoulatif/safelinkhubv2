"use client";

import { useState } from "react";
import { X } from "lucide-react";

const templates = [
  {
    name: "Voucher Business Personnalisé",
    description:
      "Style professionnel avec image de marque du hotspot et coordonnées",
    tags: ["Nom du Hotspot", "Contacts Support", "55 Pièces", "Professionnel"],
  },
  {
    name: "Modèle Classique",
    description: "Design en grille propre et professionnel, 80 pièces par page",
    tags: ["Liste de mots de passe", "60 Pièces", "Noir & Blanc", "Économique"],
  },
  {
    name: "Modèle QR Moderne",
    description: "Design contemporain avec couleurs vives et QR code",
    tags: ["QR Code", "40 Pièces", "Couleur", "Design Moderne"],
  },
  {
    name: "Carte Business Premium",
    description: "Design premium plus grand avec image de marque mise en avant",
    tags: [],
  },
  {
    name: "QR + Image de marque",
    description: "Vouchers QR code avec nom du hotspot et coordonnées",
    tags: [],
  },
];

export default function DownloadVouchersModal({
  selectedUsernames,
}: {
  selectedUsernames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const count = selectedUsernames.length;

  function handleDownload() {
    const lines = [
      `Modèle : ${templates[selected].name}`,
      "",
      ...selectedUsernames,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safelinkhub-vouchers-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={count === 0}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      >
        Télécharger la sélection
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Télécharger {count} voucher(s) sélectionné(s)
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {count} voucher(s) prêt(s) à télécharger
                </p>
              </div>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <h3 className="mt-5 text-sm font-semibold text-slate-700">
              Choisir un modèle PDF
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {templates.map((t, i) => (
                <button
                  key={t.name}
                  onClick={() => setSelected(i)}
                  className={`rounded-lg border p-3 text-left ${
                    selected === i
                      ? "border-slate-900 ring-1 ring-slate-900"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="mb-2 h-16 rounded-md bg-slate-50" />
                  <p className="text-sm font-medium text-slate-900">
                    {t.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t.description}
                  </p>
                  {t.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDownload}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Télécharger
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
