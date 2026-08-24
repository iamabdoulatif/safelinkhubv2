"use client";

// Modal de demande de déblocage d'un MikroTik rattaché à un autre compte
// (verrou de série). S'affiche quand la mise en service échoue parce que le
// numéro de série est déjà réservé. L'utilisateur envoie une demande (message
// facultatif) → l'admin est notifié (email + WhatsApp) et VALIDE depuis
// /admin/authorizations ; la validation libère le verrou.

import { useState, useTransition } from "react";
import { ShieldAlert, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { requestSerialUnlock } from "@/lib/mikrotik/serial-unlock-actions";

export default function SerialUnlockRequestModal({
  open,
  onClose,
  serial,
  routerId,
  latestStatus,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  serial: string;
  routerId?: string | null;
  latestStatus?: string | null;
  onSubmitted?: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ whatsappUrl: string; emailSent: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("serial", serial);
    if (routerId) fd.set("routerId", routerId);
    if (note.trim()) fd.set("note", note.trim());
    startTransition(async () => {
      const res = await requestSerialUnlock(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDone({ whatsappUrl: res.whatsappUrl, emailSent: res.emailSent });
      onSubmitted?.();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-brand-deep" />
          <h2 className="text-lg font-bold text-ink">Débloquer ce MikroTik</h2>
        </div>

        {done ? (
          <div className="mt-4">
            <div className="flex items-start gap-2 rounded-md bg-ok-soft p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
              <div className="text-sm text-ok">
                <p className="font-medium">Demande envoyée !</p>
                <p className="mt-1">
                  Elle est en attente de validation par le support.
                  {done.emailSent ? " Un email lui a été envoyé." : ""} Une fois validée, relancez la
                  configuration : le routeur sera rattaché à votre compte. Vous pouvez aussi prévenir
                  le support directement via WhatsApp.
                </p>
                <a
                  href={done.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-deep px-3 py-1.5 text-xs font-medium text-white"
                >
                  Prévenir via WhatsApp <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              Ce MikroTik (numéro de série{" "}
              <span className="font-mono font-medium text-ink">{serial}</span>) est déjà rattaché à un
              autre compte. Pour le rattacher au vôtre, envoyez une demande de déblocage : le support
              la validera avant que la configuration ne puisse aboutir.
            </p>

            {latestStatus === "pending" && (
              <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
                Une demande est déjà <strong>en attente de validation</strong>. Vous pouvez en
                renvoyer une si besoin.
              </p>
            )}
            {latestStatus === "rejected" && (
              <p className="mt-3 rounded-md bg-err-soft px-3 py-2 text-sm text-err">
                Votre dernière demande a été <strong>refusée</strong>. Vous pouvez en renvoyer une.
              </p>
            )}

            <div className="mt-4">
              <label className="block">
                <span className="text-xs font-medium text-ink-soft">
                  Message au support (facultatif)
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Ex : j'ai racheté ce routeur, merci de le rattacher à mon compte."
                  className="mt-1 w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:outline-none"
                />
              </label>
            </div>

            {error && (
              <p className="mt-3 rounded-md bg-err-soft px-3 py-2 text-sm text-err">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                Annuler
              </button>
              <button
                onClick={submit}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-md bg-brand-deep px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Envoyer la demande de déblocage
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
