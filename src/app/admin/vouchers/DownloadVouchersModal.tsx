"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import {
  TICKET_TEMPLATES,
  type TicketBrand,
  type TicketVoucher,
} from "@/lib/vouchers/ticket-templates";

export type SelectedVoucher = {
  code: string;
  packageName: string;
  price?: string | null;
  validity?: string | null;
};

export default function DownloadVouchersModal({
  selectedVouchers,
  brand,
}: {
  selectedVouchers: SelectedVoucher[];
  brand: TicketBrand;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const count = selectedVouchers.length;
  const template = TICKET_TEMPLATES[selected];

  async function handleDownload() {
    if (busy || count === 0) return;
    setBusy(true);
    try {
      // Génère un QR (data-URL PNG) par voucher. Le QR encode le code d'accès
      // pour que le client puisse le scanner à la borne.
      const tickets: TicketVoucher[] = await Promise.all(
        selectedVouchers.map(async (v) => ({
          code: v.code,
          packageName: v.packageName,
          price: v.price,
          validity: v.validity,
          qr: await QRCode.toDataURL(v.code, {
            margin: 0,
            width: 240,
            errorCorrectionLevel: "M",
          }),
        })),
      );

      const doc = template.buildDocument(tickets, brand);
      const win = window.open("", "_blank");
      if (win) {
        win.document.open();
        win.document.write(doc);
        win.document.close();
      } else {
        // Popups bloqués : on retombe sur un téléchargement du fichier HTML.
        const blob = new Blob([doc], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vouchers-${template.id}.html`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={count === 0}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-40"
      >
        Télécharger la sélection
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90dvh] overflow-y-auto w-full max-w-2xl rounded-xl bg-paper p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  Télécharger {count} voucher(s) sélectionné(s)
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Choisissez un modèle, puis imprimez ou enregistrez en PDF.
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>

            <h3 className="mt-5 text-sm font-semibold text-ink">
              Choisir un modèle PDF
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {TICKET_TEMPLATES.map((t, i) => {
                const Thumb = t.Thumbnail;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelected(i)}
                    className={`rounded-lg border p-3 text-left transition ${
                      selected === i
                        ? "border-ink ring-1 ring-ink"
                        : "border-line-soft hover:border-line"
                    }`}
                  >
                    <div className="mb-2 flex h-16 items-stretch overflow-hidden rounded-md bg-clay p-1">
                      <Thumb />
                    </div>
                    <p className="text-sm font-medium text-ink">{t.name}</p>
                    <p className="mt-1 text-xs text-ink-soft">{t.description}</p>
                    {t.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-clay px-1.5 py-0.5 text-[10px] text-ink-soft"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Annuler
              </button>
              <button
                onClick={handleDownload}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Préparation…" : "Télécharger"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
