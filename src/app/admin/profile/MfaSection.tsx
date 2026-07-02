"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { AlertTriangle, Check, Loader2, ShieldCheck, ShieldOff, X } from "lucide-react";
import {
  confirmMfaEnrollment,
  disableMfa,
  startMfaEnrollment,
  type StartMfaEnrollmentState,
} from "@/lib/auth/actions";

function EnrollmentFlow({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<StartMfaEnrollmentState>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmMfaEnrollment, null);

  useEffect(() => {
    startMfaEnrollment().then((res) => {
      setEnrollment(res);
      if (res?.success) {
        QRCode.toDataURL(res.uri, { width: 200, margin: 1 })
          .then(setQrDataUrl)
          .catch(() => setQrDataUrl(null));
      }
    });
  }, []);

  if (!enrollment) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <Loader2 className="h-4 w-4 animate-spin" /> Préparation...
      </p>
    );
  }

  if (!enrollment.success) {
    return <p className="text-sm text-red-600">{enrollment.error}</p>;
  }

  if (confirmState?.success) {
    return (
      <div className="rounded-lg border border-warn bg-clay p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-warn">
          <AlertTriangle className="h-4 w-4" />
          Codes de récupération — à noter maintenant, ils ne seront plus affichés
        </p>
        <p className="mt-1 text-xs text-warn">
          Chaque code ne peut être utilisé qu&apos;une fois, si vous perdez l&apos;accès à votre
          application d&apos;authentification.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-ink sm:grid-cols-4">
          {confirmState.backupCodes.map((code) => (
            <span key={code} className="rounded bg-paper px-2 py-1 text-center">
              {code}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            onDone();
            router.refresh();
          }}
          className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F]"
        >
          J&apos;ai sauvegardé mes codes
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line-soft p-4">
      <p className="text-sm text-ink-soft">
        1. Scannez ce QR code avec Google Authenticator, Authy, ou une app équivalente.
      </p>
      <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="QR code de configuration MFA"
            width={160}
            height={160}
            className="rounded-md border border-line-soft"
          />
        )}
        <div className="text-xs text-ink-soft">
          <p>Ou entrez cette clé manuellement :</p>
          <code className="mt-1 block rounded bg-clay px-2 py-1 font-mono text-ink">
            {enrollment.manualEntryKey}
          </code>
        </div>
      </div>

      <form action={confirmAction} className="mt-4 space-y-3">
        <input type="hidden" name="secretEncrypted" value={enrollment.secretEncrypted} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">
            2. Entrez le code à 6 chiffres affiché par l&apos;app
          </label>
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-40 rounded-lg border border-line-soft px-3 py-2 text-center tracking-widest focus:border-ok focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </div>
        {confirmState && !confirmState.success && (
          <p className="flex items-center gap-1 text-xs text-red-600">
            <X className="h-3.5 w-3.5" /> {confirmState.error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={confirmPending}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
          >
            {confirmPending ? "Vérification..." : "Activer"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-ink-soft hover:text-ink"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

function DisableMfaFlow({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(disableMfa, null);

  useEffect(() => {
    if (state?.success) {
      onDone();
      router.refresh();
    }
  }, [state, onDone, router]);

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
      <p className="text-sm text-red-700">
        Désactiver la double authentification réduit la sécurité de ce compte. Confirmez avec
        votre mot de passe.
      </p>
      <input
        name="currentPassword"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Mot de passe actuel"
        className="w-full max-w-xs rounded-lg border border-line-soft px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
      />
      {state && !state.success && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "Désactivation..." : "Désactiver la double authentification"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-ink-soft hover:text-ink">
          Annuler
        </button>
      </div>
    </form>
  );
}

export default function MfaSection({ mfaEnabled }: { mfaEnabled: boolean }) {
  const [mode, setMode] = useState<"idle" | "enrolling" | "disabling">("idle");

  if (mode === "enrolling") {
    return <EnrollmentFlow onDone={() => setMode("idle")} />;
  }
  if (mode === "disabling") {
    return <DisableMfaFlow onDone={() => setMode("idle")} />;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span
        className={`flex items-center gap-1.5 text-sm font-medium ${
          mfaEnabled ? "text-ok" : "text-ink-soft"
        }`}
      >
        {mfaEnabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
        {mfaEnabled ? "Activée" : "Désactivée"}
      </span>

      {mfaEnabled ? (
        <button
          type="button"
          onClick={() => setMode("disabling")}
          className="rounded-md border border-line-soft px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-clay"
        >
          Désactiver
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMode("enrolling")}
          className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3A362F]"
        >
          <Check className="h-3.5 w-3.5" />
          Activer la double authentification
        </button>
      )}
    </div>
  );
}
