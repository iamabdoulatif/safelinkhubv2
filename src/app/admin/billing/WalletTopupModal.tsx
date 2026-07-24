"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, CircleAlert, CreditCard, Globe2, Loader2, X } from "lucide-react";
import { addWalletFunds, startWalletTopupPayment } from "@/lib/wallet/actions";
import {
  getWalletEligibleCountries,
  WALLET_PAYMENT_GATEWAYS,
  WALLET_PAYMENT_METHODS,
} from "@/lib/wallet/payment-options";
import { countryFlag } from "@/lib/intl/countries";

type TopupMode = "online" | "manual";

export default function WalletTopupModal({
  geniusPayEnabled,
  defaultCountry,
}: {
  geniusPayEnabled: boolean;
  defaultCountry: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TopupMode>(geniusPayEnabled ? "online" : "manual");
  const [onlineState, onlineAction, onlinePending] = useActionState(startWalletTopupPayment, undefined);
  const [manualState, manualAction, manualPending] = useActionState(addWalletFunds, undefined);
  const countries = getWalletEligibleCountries();
  const [countryIso2, setCountryIso2] = useState(
    countries.some((country) => country.iso2 === defaultCountry)
      ? defaultCountry
      : countries[0]?.iso2 ?? "CI",
  );

  useEffect(() => {
    if (onlineState && "paymentUrl" in onlineState) {
      window.location.assign(onlineState.paymentUrl);
    }
  }, [onlineState]);

  const error = onlineState && "error" in onlineState ? onlineState.error : manualState?.error;

  function close() {
    if (!onlinePending && !manualPending) setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-brand-deep px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep"
      >
        + Ajouter des fonds
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ok">Portefeuille · recharge</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">Ajouter des fonds</h2>
                <p className="mt-1 text-sm text-ink-soft">Le dépôt confirmé devient disponible pour les VPN et l&apos;Auto-Setup.</p>
              </div>
              <button type="button" onClick={close} aria-label="Fermer" disabled={onlinePending || manualPending}>
                <X className="h-5 w-5 text-ink-soft" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-clay p-1" role="tablist" aria-label="Mode de recharge">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "online"}
                disabled={!geniusPayEnabled}
                onClick={() => setMode("online")}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "online" ? "bg-paper text-ink shadow-sm" : "text-ink-soft"} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Paiement en ligne
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "manual"}
                onClick={() => setMode("manual")}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "manual" ? "bg-paper text-ink shadow-sm" : "text-ink-soft"}`}
              >
                Dépôt manuel
              </button>
            </div>

            {!geniusPayEnabled && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>Le paiement en ligne n&apos;est pas encore configuré. Utilisez le dépôt manuel après confirmation avec SafeLinkHub.</p>
              </div>
            )}

            {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            {manualState?.success && (
              <p className="mt-4 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                <Check className="h-4 w-4" aria-hidden="true" /> Dépôt manuel enregistré dans le journal.
              </p>
            )}

            {mode === "online" && geniusPayEnabled ? (
              <form action={onlineAction} className="mt-5 space-y-5">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Montant à ajouter (FCFA)</label>
                  <input name="amount" type="number" min={200} max={5000000} step={100} required placeholder="15000" className="w-full rounded-md border border-line-soft bg-paper px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink" />
                  <p className="mt-1 text-xs text-ink-soft">Minimum 200 FCFA · maximum 5 000 000 FCFA</p>
                </div>

                <fieldset>
                  <legend className="text-sm font-medium text-ink">Moyen de paiement</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {WALLET_PAYMENT_METHODS.map((method) => (
                      <label key={method.id} className="cursor-pointer">
                        <input type="radio" name="paymentMethod" value={method.id} defaultChecked={method.id === "wave"} className="peer sr-only" />
                        <span className="flex h-full flex-col rounded-md border-2 border-line-soft bg-paper px-3 py-2.5 text-left transition-colors peer-checked:border-brand-deep peer-checked:bg-brand/20 hover:bg-clay">
                          <span className="text-sm font-semibold text-ink">{method.label}</span>
                          <span className="mt-0.5 text-[11px] text-ink-soft">{method.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink" htmlFor="wallet-country">
                    <Globe2 className="h-4 w-4 text-ink-soft" aria-hidden="true" /> Pays de paiement
                  </label>
                  <select id="wallet-country" name="countryIso2" value={countryIso2} onChange={(event) => setCountryIso2(event.target.value)} className="w-full rounded-md border border-line-soft bg-paper px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink">
                    {countries.map((country) => <option key={country.iso2} value={country.iso2}>{countryFlag(country.iso2)} {country.name} ({country.dialCode})</option>)}
                  </select>
                  <p className="mt-1.5 text-xs leading-5 text-ink-soft">Pays actuellement proposés par SafeLinkHub pour le paiement en XOF. La disponibilité finale dépend du réseau mobile sélectionné.</p>
                </div>

                <div className="border border-line-soft bg-clay p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-ink"><CreditCard className="h-4 w-4" aria-hidden="true" /> Passerelle sélectionnée : Genius Pay</div>
                  <p className="mt-1 text-xs leading-5 text-ink-soft">Le checkout sécurisé affichera le rail choisi et confirme le dépôt uniquement après notification de paiement.</p>
                </div>

                <button type="submit" disabled={onlinePending} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3A362F] disabled:opacity-60">
                  {onlinePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
                  {onlinePending ? "Ouverture du paiement…" : "Continuer vers Genius Pay"}
                </button>
              </form>
            ) : (
              <form action={manualAction} className="mt-5 space-y-4">
                <div className="flex items-start gap-2 rounded-md border border-line-soft bg-clay px-3 py-2.5 text-xs leading-5 text-ink-soft">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                  Le dépôt manuel est réservé aux montants déjà confirmés avec l&apos;équipe SafeLinkHub (virement, mobile money ou autre accord).
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Montant confirmé (FCFA)</label>
                  <input name="amount" type="number" min={1} required placeholder="5000" className="w-full rounded-md border border-line-soft px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Référence ou note</label>
                  <input name="note" placeholder="Ex : reçu Wave du 22/07" className="w-full rounded-md border border-line-soft px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink" />
                </div>
                <button type="submit" disabled={manualPending} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3A362F] disabled:opacity-60">
                  {manualPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {manualPending ? "Enregistrement…" : "Enregistrer le dépôt confirmé"}
                </button>
              </form>
            )}

            <div className="mt-5 border-t border-line-soft pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Passerelles</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {WALLET_PAYMENT_GATEWAYS.map((gateway) => (
                  <div key={gateway.id} className={`rounded-md border px-2.5 py-2 ${gateway.status === "available" && geniusPayEnabled ? "border-green-200 bg-green-50" : "border-line-soft bg-clay"}`}>
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-ink">{gateway.label}</span>{gateway.status === "available" && geniusPayEnabled ? <Check className="h-3.5 w-3.5 text-ok" aria-label="Disponible" /> : <span className="text-[10px] text-ink-soft">Bientôt</span>}</div>
                    <p className="mt-1 text-[10px] leading-4 text-ink-soft">{gateway.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
