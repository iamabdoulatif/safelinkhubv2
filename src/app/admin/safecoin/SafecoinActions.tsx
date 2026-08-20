"use client";

import { useActionState } from "react";
import { Check, Save } from "lucide-react";
import { updateSafecoinSettings } from "@/lib/safecoin/actions";

export default function SafecoinActions({
  rateFcfaPerSc,
  rechargeFeeScCents,
  vpnFeeScCents,
  autoSetupFeeScCents,
}: {
  rateFcfaPerSc: number;
  rechargeFeeScCents: number;
  vpnFeeScCents: number;
  autoSetupFeeScCents: number;
}) {
  const [state, action, pending] = useActionState(updateSafecoinSettings, undefined);
  return (
    <div className="border border-line bg-paper p-5 sm:p-6 rounded-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep">Paramètres de contrôle</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Taux et frais</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">Les changements s&apos;appliquent uniquement aux nouvelles opérations. Les écritures existantes conservent leur taux et leur version.</p>
        </div>
        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-ok">Version active</span>
      </div>
      {state && "error" in state && <p className="mt-4 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state && "success" in state && <p className="mt-4 flex items-center gap-2 bg-green-50 px-3 py-2 text-sm text-green-800"><Check className="h-4 w-4" aria-hidden="true" /> Paramètres Safecoin enregistrés.</p>}
      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-ink">FCFA pour 1 SC<input name="rateFcfaPerSc" type="number" min={1} required defaultValue={rateFcfaPerSc} className="mt-1.5 w-full border border-line-soft bg-paper px-3 py-2.5 text-sm rounded-lg" /></label>
        <label className="text-sm font-medium text-ink">Frais recharge (centièmes SC)<input name="rechargeFeeScCents" type="number" min={0} required defaultValue={rechargeFeeScCents} className="mt-1.5 w-full border border-line-soft bg-paper px-3 py-2.5 text-sm rounded-lg" /></label>
        <label className="text-sm font-medium text-ink">Frais VPN (centièmes SC)<input name="vpnFeeScCents" type="number" min={0} required defaultValue={vpnFeeScCents} className="mt-1.5 w-full border border-line-soft bg-paper px-3 py-2.5 text-sm rounded-lg" /></label>
        <label className="text-sm font-medium text-ink">Frais Auto-Setup (centièmes SC)<input name="autoSetupFeeScCents" type="number" min={0} required defaultValue={autoSetupFeeScCents} className="mt-1.5 w-full border border-line-soft bg-paper px-3 py-2.5 text-sm rounded-lg" /></label>
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2 lg:col-span-1"><Save className="h-4 w-4" aria-hidden="true" />{pending ? "Enregistrement…" : "Publier les règles"}</button>
      </form>
    </div>
  );
}
