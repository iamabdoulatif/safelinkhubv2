import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Coins,
  Gauge,
  LockKeyhole,
  WalletCards,
} from "lucide-react";
import SectionHeading from "./SectionHeading";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";
import { remoteAccessPriceFcfa } from "@/lib/billing/remote-access-gate-config";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";
import { fcfaToScCents, formatSc } from "@/lib/safecoin/pricing";

const fcfa = new Intl.NumberFormat("fr-FR");

function scFromFcfa(amountFcfa: number) {
  return formatSc(fcfaToScCents(amountFcfa, DEFAULT_SC_RATE_FCFA));
}

const vpnRepères = [
  { label: "1 mois", amount: remoteAccessPriceFcfa("monthly") },
  { label: "3 mois", amount: remoteAccessPriceFcfa("quarterly") },
  { label: "6 mois", amount: remoteAccessPriceFcfa("semiannual") },
  { label: "12 mois", amount: remoteAccessPriceFcfa("yearly") },
] as const;

export default function SafecoinSection() {
  return (
    <section
      id="safecoin"
      aria-label="Safecoin"
      className="border-b-2 border-line bg-clay py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="06"
          title="Le réseau avance avec Safecoin."
          marker="Safecoin"
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="relative overflow-hidden border-2 border-line bg-ink p-6 text-paper sm:p-8 lg:col-span-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-4">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-brand">
                SFC / crédit opérateur
              </span>
              <LockKeyhole aria-hidden="true" className="h-4 w-4 text-brand" />
            </div>

            <div className="mt-10 flex items-center gap-5">
              <div
                aria-hidden="true"
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center border-2 border-brand bg-brand text-[#1C1917]"
              >
                <Coins className="h-7 w-7" />
                <span className="mt-1 font-mono text-sm font-black tracking-widest">SC</span>
              </div>
              <div>
                <p className="font-display text-2xl font-bold">Safecoin</p>
                <p className="mt-1 text-sm text-[#A8A29E]">La monnaie interne de votre réseau.</p>
              </div>
            </div>

            <div className="mt-10 border-t border-white/20 pt-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8A29E]">
                Taux de référence
              </p>
              <p className="mt-2 font-display text-4xl font-extrabold tracking-tight">
                1 SC <span className="text-brand">=</span> {fcfa.format(DEFAULT_SC_RATE_FCFA)} FCFA
              </p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-[#A8A29E]">
                Un solde prépayé, lisible et maîtrisé pour activer vos services sans jongler entre plusieurs paiements.
              </p>
            </div>
          </div>

          <div className="border-2 border-line bg-paper p-6 sm:p-8 lg:col-span-7">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-deep">
                  Le circuit en trois gestes
                </p>
                <h3 className="mt-2 max-w-xl font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
                  Rechargez une fois. Gardez la main sur chaque dépense.
                </h3>
              </div>
              <WalletCards aria-hidden="true" className="hidden h-8 w-8 shrink-0 text-ink sm:block" />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-px border-2 border-line bg-line sm:grid-cols-3">
              {[
                {
                  number: "01",
                  title: "Recharge",
                  text: "Ajoutez des FCFA par votre passerelle de paiement.",
                  icon: ArrowDownToLine,
                },
                {
                  number: "02",
                  title: "Crédit",
                  text: "Votre compte reçoit automatiquement ses SC.",
                  icon: Coins,
                },
                {
                  number: "03",
                  title: "Activation",
                  text: "VPN et Auto-Setup débitent le bon montant.",
                  icon: Gauge,
                },
              ].map(({ number, title, text, icon: Icon }) => (
                <div key={number} className="bg-paper p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-bold text-brand-deep">{number}</span>
                    <Icon aria-hidden="true" className="h-4 w-4 text-ink-soft" />
                  </div>
                  <h4 className="mt-5 font-display text-base font-bold text-ink">{title}</h4>
                  <p className="mt-1 text-xs leading-5 text-ink-soft">{text}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-soft">
              {[
                "Historique de chaque mouvement",
                "Frais visibles avant activation",
                "Promos gratuites hors débit",
              ].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-ok" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="border-2 border-line bg-paper lg:col-span-7">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-line px-5 py-4">
              <div>
                <h3 className="font-display text-xl font-bold text-ink">Repères de consommation</h3>
                <p className="mt-1 text-xs text-ink-soft">Accès distant · par service et par période</p>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-brand-deep">
                base actuelle
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {vpnRepères.map((plan, index) => (
                <div
                  key={plan.label}
                  className={`p-4 sm:p-5 ${index > 0 ? "border-t-2 border-line sm:border-l-2 sm:border-t-0" : ""} ${index > 1 ? "border-t-2 sm:border-t-0" : ""}`}
                >
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                    {plan.label}
                  </p>
                  <p className="mt-2 font-display text-2xl font-bold tabular-nums text-ink">
                    {scFromFcfa(plan.amount)}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-ink-soft">
                    {fcfa.format(plan.amount)} FCFA
                  </p>
                </div>
              ))}
            </div>
            <p className="border-t-2 border-line bg-clay px-5 py-3 text-xs text-ink-soft">
              Tarif de base par service. Les frais Safecoin configurés par l’administrateur sont affichés avant chaque débit.
            </p>
          </div>

          <div className="border-2 border-line bg-brand p-5 sm:p-6 lg:col-span-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#1C1917]/70">
              Auto-Setup
            </p>
            <h3 className="mt-2 font-display text-xl font-bold text-[#1C1917]">
              Un budget clair pour chaque installation.
            </h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="border-2 border-[#1C1917] bg-brand px-3 py-3">
                <p className="text-xs font-semibold text-[#44403C]">Hotspot seul</p>
                <p className="mt-2 font-display text-2xl font-extrabold text-[#1C1917]">
                  {scFromFcfa(autoSetupFeeCentsFor(false))}
                </p>
              </div>
              <div className="border-2 border-[#1C1917] bg-[#1C1917] px-3 py-3 text-paper">
                <p className="text-xs font-semibold text-clay">Avec conteneur</p>
                <p className="mt-2 font-display text-2xl font-extrabold text-brand">
                  {scFromFcfa(autoSetupFeeCentsFor(true))}
                </p>
              </div>
            </div>
            <Link
              href="/auth/register"
              className="mt-5 inline-flex items-center gap-2 border-2 border-[#1C1917] bg-[#1C1917] px-4 py-2.5 text-sm font-bold text-paper hover:bg-paper hover:text-ink"
            >
              Ouvrir mon compte Safecoin
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <p className="mt-6 max-w-3xl font-mono text-[11px] leading-5 text-ink-soft">
          Safecoin est un crédit interne de SafeLinkHub, pas une cryptomonnaie. Le taux et les frais sont pilotés depuis la station de contrôle ; les quotas offerts, parrainages et récompenses restent gratuits.
        </p>
      </div>
    </section>
  );
}
