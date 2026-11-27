"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleAlert, Smartphone } from "lucide-react";
import {
  setDevicesPerVoucher,
  applyDevicesPerVoucherToFleet,
} from "@/lib/org/devices-per-voucher-actions";

export default function DevicesPerVoucherCard({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial));
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const n = Math.max(1, Math.min(100, Math.floor(Number(value)) || 1));
  const dirty = n !== saved;

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await setDevicesPerVoucher(n);
      if ("error" in r) return setMsg({ ok: false, text: r.error });
      setSaved(r.value);
      setValue(String(r.value));
      setMsg({ ok: true, text: `Enregistré : ${r.value} appareil${r.value > 1 ? "s" : ""} par code.` });
    });
  }

  function apply() {
    setMsg(null);
    startTransition(async () => {
      // On enregistre d'abord si la valeur a changé, pour pousser la bonne.
      if (dirty) {
        const s = await setDevicesPerVoucher(n);
        if ("error" in s) return setMsg({ ok: false, text: s.error });
        setSaved(s.value);
      }
      const r = await applyDevicesPerVoucherToFleet();
      if ("error" in r) return setMsg({ ok: false, text: r.error });
      const parts = [
        `${r.routersUpdated} routeur${r.routersUpdated > 1 ? "s" : ""} mis à jour`,
        `${r.profilesUpdated} forfait${r.profilesUpdated > 1 ? "s" : ""}`,
      ];
      if (r.offline > 0) parts.push(`${r.offline} hors ligne (ignoré${r.offline > 1 ? "s" : ""})`);
      if (r.failed.length > 0) parts.push(`${r.failed.length} en échec`);
      setMsg({
        ok: r.failed.length === 0,
        text: `${r.value} appareil${r.value > 1 ? "s" : ""}/code appliqué — ${parts.join(", ")}.`,
      });
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-paper p-4 sm:p-6">
      <div className="flex items-start gap-2.5">
        <Smartphone aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" />
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Appareils par code</h2>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            Nombre de téléphones qui peuvent utiliser <strong>le même code</strong> en même
            temps. <strong>1</strong> = un seul appareil par code (anti-partage). S&apos;applique à
            tous vos forfaits.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-bold text-ink">
          Appareils
          <input
            type="number"
            min={1}
            max={100}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            className="w-20 border border-line bg-paper px-3 py-1.5 text-sm text-ink rounded-lg"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="border border-line px-3 py-1.5 text-sm font-bold text-ink-soft transition-colors duration-150 hover:bg-clay hover:text-ink disabled:opacity-50 rounded-lg"
        >
          Enregistrer
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={pending}
          className="border border-line bg-brand px-3 py-1.5 text-sm font-bold text-slate-deep transition-colors duration-150 hover:opacity-90 disabled:opacity-50 rounded-lg"
        >
          {pending ? "…" : "Appliquer à mes routeurs"}
        </button>
      </div>

      {msg ? (
        <div
          aria-live="polite"
          className={`mt-4 flex items-start gap-2.5 border px-4 py-3 text-sm ${
            msg.ok ? "border-line bg-clay text-ink" : "border-warn bg-paper text-ink"
          }`}
        >
          {msg.ok ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
          ) : (
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          )}
          <p className="leading-6">{msg.text}</p>
        </div>
      ) : null}
    </section>
  );
}
