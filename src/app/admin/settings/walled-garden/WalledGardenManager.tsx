"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import {
  PAYMENT_WALLED_GARDEN_HOSTS,
  WALLED_GARDEN_CATALOG,
} from "@/lib/mikrotik/walled-garden";
import { saveWalledGardenSelection } from "./actions";

export default function WalledGardenManager({
  initialDisabled,
}: {
  initialDisabled: string[];
}) {
  // On stocke l'ensemble DÉSACTIVÉ (décoché) — miroir exact de ce qui est
  // persisté. Une case cochée = hôte installé = absent de ce Set.
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set(initialDisabled));
  const [savedDisabled, setSavedDisabled] = useState<string[]>(() =>
    [...initialDisabled].sort(),
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const enabledCount = PAYMENT_WALLED_GARDEN_HOSTS.length - disabled.size;

  const dirty = useMemo(() => {
    const current = [...disabled].sort();
    return current.length !== savedDisabled.length || current.some((h, i) => h !== savedDisabled[i]);
  }, [disabled, savedDisabled]);

  function toggleHost(host: string) {
    setFeedback(null);
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(host)) next.delete(host);
      else next.add(host);
      return next;
    });
  }

  function setGroup(hosts: string[], enable: boolean) {
    setFeedback(null);
    setDisabled((prev) => {
      const next = new Set(prev);
      for (const host of hosts) {
        if (enable) next.delete(host);
        else next.add(host);
      }
      return next;
    });
  }

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const payload = [...disabled];
      const result = await saveWalledGardenSelection(payload);
      if ("error" in result) {
        setFeedback({ ok: false, message: result.error });
        return;
      }
      setSavedDisabled([...payload].sort());
      setFeedback({ ok: true, message: "Sélection enregistrée." });
    });
  }

  return (
    <section className="border-2 border-line bg-paper p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink">Hôtes autorisés</h2>
        <span className="border-2 border-line bg-clay px-3 py-1 text-xs font-bold text-ink">
          {enabledCount} / {PAYMENT_WALLED_GARDEN_HOSTS.length} installés
        </span>
      </div>

      <div className="mt-4 space-y-5">
        {WALLED_GARDEN_CATALOG.map((group) => {
          const allOn = group.hosts.every((h) => !disabled.has(h));
          const noneOn = group.hosts.every((h) => disabled.has(h));
          return (
            <fieldset key={group.group} className="border-2 border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <legend className="font-display text-sm font-extrabold text-ink">
                  {group.group}
                </legend>
                <button
                  type="button"
                  onClick={() => setGroup(group.hosts, !allOn)}
                  className="border-2 border-line bg-paper px-2.5 py-1 text-xs font-bold text-ink-soft transition-colors duration-150 hover:bg-clay hover:text-ink"
                >
                  {allOn ? "Tout décocher" : "Tout cocher"}
                </button>
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-soft">{group.description}</p>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.hosts.map((host) => {
                  const on = !disabled.has(host);
                  return (
                    <label
                      key={host}
                      className={`flex cursor-pointer items-center gap-2.5 border-2 px-3 py-2 text-sm transition-colors duration-150 ${
                        on ? "border-line bg-clay text-ink" : "border-line bg-paper text-ink-soft"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleHost(host)}
                        className="h-4 w-4 shrink-0 accent-brand"
                      />
                      <code className="truncate font-mono text-xs">{host}</code>
                    </label>
                  );
                })}
              </div>

              {noneOn ? (
                <p className="mt-2 text-xs font-bold text-warn">
                  Rail entièrement désactivé — ce moyen de paiement ne se chargera pas
                  au portail.
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="border-2 border-line bg-brand px-4 py-2 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer la sélection"}
        </button>
        {dirty && !pending ? (
          <span className="text-xs font-bold text-ink-soft">Modifications non enregistrées</span>
        ) : null}
        {feedback ? (
          <span
            aria-live="polite"
            className={`flex items-center gap-1.5 text-xs font-bold ${
              feedback.ok ? "text-ok" : "text-warn"
            }`}
          >
            {feedback.ok ? (
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            ) : (
              <CircleAlert aria-hidden="true" className="h-4 w-4" />
            )}
            {feedback.message}
          </span>
        ) : null}
      </div>
    </section>
  );
}
