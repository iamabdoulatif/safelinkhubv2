"use client";

import { useState, useTransition } from "react";
import { generateAutopilotCode, revokeAutopilotLink } from "@/lib/autopilot/actions";

type Status = { linkedAt: string | null; lastUsedAt: string | null } | null;

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("fr-FR") : "—");

export default function AutopilotLinkCard({ status }: { status: Status }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="border border-line bg-paper p-6 rounded-xl">
      <h2 className="font-semibold text-ink">SafeLink Auto-Pilot</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Permet à app.safelinkhub.io d&apos;importer vos routeurs déjà connectés en WireGuard ici, sans
        créer de second tunnel (pas de conflit ni de coupure d&apos;accès à distance). Auto-Pilot ne reçoit
        que le nom, l&apos;adresse de tunnel et l&apos;adresse MikHmon — aucun mot de passe.
      </p>
      {status && (
        <p className="mt-3 rounded-lg bg-clay px-3 py-2 text-sm text-ok">
          Lié depuis le {fmt(status.linkedAt)} · dernière utilisation : {fmt(status.lastUsedAt)}
        </p>
      )}
      {error && <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p>}
      {code && (
        <div className="mt-3 rounded-lg border border-line px-3 py-3 text-sm text-ink">
          Code de liaison (valable 10 min, usage unique) :{" "}
          <b className="font-mono text-lg tracking-widest">{code}</b>
          <br />À saisir dans Auto-Pilot → Routeurs → « Importer depuis SafeLinkHub ».
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="btn btn-md btn-secondary"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await generateAutopilotCode();
              if (r.error) setError(r.error);
              else setCode(r.code ?? null);
            })
          }
        >
          {status ? "Nouveau code de liaison" : "Générer un code de liaison"}
        </button>
        {status && (
          <button
            type="button"
            disabled={busy}
            className="btn btn-md btn-secondary"
            onClick={() =>
              start(async () => {
                const r = await revokeAutopilotLink();
                if (r.error) setError(r.error);
                setCode(null);
              })
            }
          >
            Révoquer la liaison
          </button>
        )}
      </div>
    </div>
  );
}
