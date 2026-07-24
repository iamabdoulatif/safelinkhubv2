"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  Coins,
  CreditCard,
  Globe2,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  addSafecoinFundsManually,
  cleanupSafecoinEntries,
  deleteSafecoinEntry,
  startSafecoinTopupPayment,
  updateSafecoinEntry,
} from "@/lib/safecoin/actions";
import { formatSc, scCentsToFcfa } from "@/lib/safecoin/pricing";
import { getWalletEligibleCountries, WALLET_PAYMENT_METHODS } from "@/lib/wallet/payment-options";
import { countryFlag } from "@/lib/intl/countries";
import { PERIOD_PRICE_CENTS } from "@/lib/mikrotik/billing-plans";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";

type Entry = {
  id: string;
  entryType: string;
  amountScCents: number;
  status: string;
  note: string | null;
  createdAt: Date;
};

function entryLabel(entry: Entry) {
  if (entry.status === "pending") return "Recharge en attente";
  if (entry.status === "failed") return "Recharge échouée";
  if (entry.entryType === "topup") return "Recharge Safecoin";
  if (entry.entryType === "vpn_charge") return "Accès VPN";
  if (entry.entryType === "auto_setup_charge") return "Auto-Setup";
  if (entry.entryType === "fee") return "Frais de service";
  if (entry.entryType === "reversal" || entry.entryType === "refund") return "Correction / remboursement";
  return "Opération Safecoin";
}

function entryTone(entry: Entry) {
  if (entry.status === "pending") return "bg-clay text-ink-soft";
  if (entry.status === "failed") return "bg-red-50 text-red-700";
  return entry.amountScCents >= 0 ? "bg-green-50 text-ok" : "bg-amber-50 text-warn";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** En attente / échouée = supprimable (n'entre pas dans le solde). */
function isDeletableEntry(entry: Entry) {
  return entry.status === "pending" || entry.status === "failed";
}

const SC_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  completed: "Confirmé",
  failed: "Échoué",
};

export default function SafecoinWalletCard({
  balanceScCents,
  rateFcfaPerSc,
  entries,
  geniusPayEnabled,
  defaultCountry,
}: {
  balanceScCents: number;
  rateFcfaPerSc: number;
  entries: Entry[];
  geniusPayEnabled: boolean;
  defaultCountry: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"online" | "manual">(geniusPayEnabled ? "online" : "manual");
  const [onlineState, onlineAction, onlinePending] = useActionState(startSafecoinTopupPayment, undefined);
  const [manualState, manualAction, manualPending] = useActionState(addSafecoinFundsManually, undefined);
  const countries = getWalletEligibleCountries();
  const [countryIso2, setCountryIso2] = useState(
    countries.some((country) => country.iso2 === defaultCountry)
      ? defaultCountry
      : countries[0]?.iso2 ?? "CI",
  );
  const [editing, setEditing] = useState<Entry | null>(null);
  const [managePending, startManage] = useTransition();
  const cleanableCount = entries.filter(isDeletableEntry).length;

  function doDeleteEntry(id: string) {
    if (managePending) return;
    if (!confirm("Supprimer cette opération ? (sans effet sur le solde)")) return;
    const fd = new FormData();
    fd.set("id", id);
    startManage(async () => {
      await deleteSafecoinEntry(undefined, fd);
    });
  }

  function doCleanupEntries() {
    if (managePending) return;
    if (!confirm(`Supprimer les ${cleanableCount} opération(s) en attente/échouée(s) ?`)) return;
    startManage(async () => {
      await cleanupSafecoinEntries();
    });
  }

  useEffect(() => {
    if (onlineState && "paymentUrl" in onlineState) window.location.assign(onlineState.paymentUrl);
  }, [onlineState]);

  const error = onlineState && "error" in onlineState ? onlineState.error : manualState?.error;
  const fcfaValue = scCentsToFcfa(balanceScCents, rateFcfaPerSc);
  const close = () => {
    if (!onlinePending && !manualPending) setOpen(false);
  };
  const plans = [
    { label: "VPN · 1 mois", sc: Math.ceil(PERIOD_PRICE_CENTS.monthly / rateFcfaPerSc) },
    { label: "VPN · 12 mois", sc: Math.ceil(PERIOD_PRICE_CENTS.yearly / rateFcfaPerSc) },
    { label: "Auto-Setup", sc: Math.ceil(autoSetupFeeCentsFor(false) / rateFcfaPerSc) },
  ];

  return (
    <section className="relative overflow-hidden border-2 border-line bg-paper shadow-[6px_6px_0_var(--line)]">
      <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand/20 blur-3xl" aria-hidden="true" />
      <div className="relative border-b border-line-soft bg-[#1c1917] p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Coins className="h-5 w-5" aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em]">SafeLinkHub · crédit interne</span>
            </div>
            <h2 className="mt-2 text-xl font-semibold">Solde Safecoin</h2>
            <p className="mt-1 text-sm text-white/65">Le carburant du VPN et de l&apos;Auto-Setup.</p>
          </div>
          <div className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80">
            1 SC = {rateFcfaPerSc.toLocaleString("fr-FR")} FCFA
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-4xl font-bold tracking-tight text-brand">{formatSc(balanceScCents)}</p>
            <p className="mt-1 text-sm text-white/60">≈ {fcfaValue.toLocaleString("fr-FR")} FCFA/XOF</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-[#1c1917] transition-transform hover:-translate-y-0.5"
          >
            <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> Ajouter des SC
          </button>
        </div>
      </div>

      <div className="relative grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        {plans.map((plan) => (
          <div key={plan.label} className="border border-line-soft bg-clay/50 p-3">
            <p className="text-xs text-ink-soft">{plan.label}</p>
            <p className="mt-1 text-lg font-bold text-ink">{plan.sc} SC</p>
            <p className="text-[11px] text-ink-soft">prix catalogue</p>
          </div>
        ))}
      </div>

      <div className="relative border-t border-line-soft px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-ok" aria-hidden="true" />
            <p className="text-xs text-ink-soft">Crédit interne, non retirable et non transférable.</p>
          </div>
          <div className="flex items-center gap-2">
            {cleanableCount > 0 && (
              <button
                type="button"
                onClick={doCleanupEntries}
                disabled={managePending}
                className="inline-flex items-center gap-1 rounded-md border border-line-soft bg-paper px-2 py-1 text-[11px] font-semibold text-ink-soft hover:bg-clay disabled:opacity-60"
              >
                {managePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Nettoyer les échouées / en attente ({cleanableCount})
              </button>
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">Journal récent</span>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {entries.length === 0 ? (
            <p className="border border-dashed border-line-soft px-3 py-4 text-center text-sm text-ink-soft">Aucune opération Safecoin pour le moment.</p>
          ) : entries.slice(0, 8).map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border border-line-soft px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${entryTone(entry)}`}>{entryLabel(entry)}</span>
                <span className="text-xs text-ink-soft">{formatDate(new Date(entry.createdAt))}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`font-semibold ${entry.amountScCents >= 0 ? "text-ok" : "text-warn"}`}>
                  {entry.status === "completed" && entry.amountScCents >= 0 ? "+" : ""}{formatSc(Math.abs(entry.amountScCents))}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(entry)}
                  title="Modifier"
                  aria-label="Modifier"
                  className="rounded-md p-1 text-ink-soft hover:bg-clay hover:text-ink"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {isDeletableEntry(entry) && (
                  <button
                    type="button"
                    onClick={() => doDeleteEntry(entry.id)}
                    disabled={managePending}
                    title="Supprimer"
                    aria-label="Supprimer"
                    className="rounded-md p-1 text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && <SafecoinEditModal entry={editing} onClose={() => setEditing(null)} />}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto border-2 border-line bg-paper p-5 shadow-[8px_8px_0_rgba(28,25,23,.25)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep">Safecoin · recharge</p>
                <h3 className="mt-1 text-lg font-semibold text-ink">Ajouter des SC</h3>
                <p className="mt-1 text-sm text-ink-soft">Le montant FCFA est converti au taux actif et confirmé par webhook.</p>
              </div>
              <button type="button" onClick={close} disabled={onlinePending || manualPending} aria-label="Fermer"><X className="h-5 w-5 text-ink-soft" /></button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 border border-line-soft bg-clay p-1" role="tablist" aria-label="Mode de recharge Safecoin">
              <button type="button" role="tab" aria-selected={mode === "online"} disabled={!geniusPayEnabled} onClick={() => setMode("online")} className={`px-3 py-2 text-sm font-semibold ${mode === "online" ? "bg-paper text-ink shadow-sm" : "text-ink-soft"}`}>Paiement en ligne</button>
              <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")} className={`px-3 py-2 text-sm font-semibold ${mode === "manual" ? "bg-paper text-ink shadow-sm" : "text-ink-soft"}`}>Dépôt manuel</button>
            </div>
            {!geniusPayEnabled && <div className="mt-4 flex gap-2 border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> <p>Le paiement en ligne n&apos;est pas encore configuré. Utilisez le dépôt manuel confirmé par l&apos;équipe.</p></div>}
            {error && <p className="mt-4 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {manualState?.success && <p className="mt-4 flex items-center gap-2 bg-green-50 px-3 py-2 text-sm text-green-800"><Check className="h-4 w-4" aria-hidden="true" /> Recharge Safecoin enregistrée.</p>}

            {mode === "online" && geniusPayEnabled ? (
              <form action={onlineAction} className="mt-5 space-y-5">
                <div><label className="mb-1 block text-sm font-medium text-ink">Montant à convertir (FCFA)</label><input name="amount" type="number" min={100} max={5000000} step={100} required placeholder="10000" className="w-full border border-line-soft bg-paper px-3 py-2.5 text-sm focus:border-ink focus:outline-none" /><p className="mt-1 text-xs text-ink-soft">Minimum 100 FCFA · le crédit sera calculé au taux actif.</p></div>
                <fieldset><legend className="text-sm font-medium text-ink">Moyen de paiement</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{WALLET_PAYMENT_METHODS.map((method) => <label key={method.id} className="cursor-pointer"><input type="radio" name="paymentMethod" value={method.id} defaultChecked={method.id === "wave"} className="peer sr-only" /><span className="flex h-full flex-col border-2 border-line-soft px-3 py-2.5 peer-checked:border-brand-deep peer-checked:bg-brand/20"><span className="text-sm font-semibold text-ink">{method.label}</span><span className="mt-0.5 text-[11px] text-ink-soft">{method.hint}</span></span></label>)}</div></fieldset>
                <div><label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink"><Globe2 className="h-4 w-4 text-ink-soft" aria-hidden="true" /> Pays de paiement</label><select name="countryIso2" value={countryIso2} onChange={(event) => setCountryIso2(event.target.value)} className="w-full border border-line-soft bg-paper px-3 py-2.5 text-sm">{countries.map((country) => <option key={country.iso2} value={country.iso2}>{countryFlag(country.iso2)} {country.name} ({country.dialCode})</option>)}</select></div>
                <button type="submit" disabled={onlinePending} className="inline-flex w-full items-center justify-center gap-2 bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{onlinePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}{onlinePending ? "Ouverture du paiement…" : "Continuer vers Genius Pay"}</button>
              </form>
            ) : (
              <form action={manualAction} className="mt-5 space-y-4">
                <div className="flex gap-2 border border-line-soft bg-clay px-3 py-2.5 text-xs text-ink-soft"><Check className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> Le dépôt manuel doit être confirmé par l&apos;équipe SafeLinkHub.</div>
                <div><label className="mb-1 block text-sm font-medium text-ink">Montant confirmé (FCFA)</label><input name="amount" type="number" min={100} required placeholder="10000" className="w-full border border-line-soft px-3 py-2.5 text-sm" /></div>
                <div><label className="mb-1 block text-sm font-medium text-ink">Référence ou note</label><input name="note" placeholder="Ex : reçu Wave du 22/07" className="w-full border border-line-soft px-3 py-2.5 text-sm" /></div>
                <button type="submit" disabled={manualPending} className="inline-flex w-full items-center justify-center gap-2 bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{manualPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{manualPending ? "Enregistrement…" : "Enregistrer le dépôt confirmé"}</button>
              </form>
            )}
            <div className="mt-5 flex items-start gap-2 border-t border-line-soft pt-4 text-xs text-ink-soft"><Zap className="mt-0.5 h-4 w-4 text-brand-deep" aria-hidden="true" /> Les SC servent uniquement aux services SafeLinkHub et ne peuvent pas être retirés en espèces.</div>
          </div>
        </div>
      )}
    </section>
  );
}

function SafecoinEditModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateSafecoinEntry, undefined);

  useEffect(() => {
    if (state && "success" in state && state.success) onClose();
  }, [state, onClose]);

  const error = state && "error" in state ? state.error : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md border-2 border-line bg-paper p-5 shadow-[8px_8px_0_rgba(28,25,23,.25)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-deep">
              Safecoin · écriture
            </p>
            <h3 className="mt-1 text-lg font-semibold text-ink">Modifier l&apos;opération</h3>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Fermer">
            <X className="h-5 w-5 text-ink-soft" />
          </button>
        </div>

        {error && <p className="mt-4 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={entry.id} />

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Montant (SC)</label>
            <input
              name="amountSc"
              type="number"
              step="0.01"
              required
              defaultValue={entry.amountScCents / 100}
              className="w-full border border-line-soft bg-paper px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
            />
            <p className="mt-1 text-xs text-ink-soft">Négatif = débit (frais, accès VPN…), positif = crédit.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Statut</label>
            <select
              name="status"
              defaultValue={entry.status}
              className="w-full border border-line-soft bg-paper px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            >
              {Object.entries(SC_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Note</label>
            <input
              name="note"
              defaultValue={entry.note ?? ""}
              placeholder="Ex : correction du 24/07"
              className="w-full border border-line-soft bg-paper px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
            />
          </div>

          <p className="border border-line-soft bg-clay px-3 py-2 text-xs leading-5 text-ink-soft">
            Le solde Safecoin est <b>recalculé</b> depuis le journal après enregistrement (somme des
            écritures confirmées). Changer le montant ou le statut peut donc modifier le solde.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 border border-line-soft bg-paper px-4 py-2.5 text-sm font-semibold text-ink hover:bg-clay disabled:opacity-60"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-2 bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
