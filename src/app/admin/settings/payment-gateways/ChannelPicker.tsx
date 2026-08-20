"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Provider } from "@/lib/payment-gateways/providers";

type Channel = {
  key: string;
  label: string;
  hint: string;
};

// Tous les agrégateurs branchés (Paystack, Genius Pay, PawaPay) couvrent
// l'ensemble de ces canaux en interne — le sélecteur sert à visualiser,
// canal par canal, par quelle passerelle active l'argent transite.
const CHANNELS: Channel[] = [
  { key: "orange", label: "Orange Money", hint: "portefeuille mobile Orange" },
  { key: "mtn", label: "MTN MoMo", hint: "portefeuille mobile MTN" },
  { key: "moov", label: "Moov Money", hint: "portefeuille mobile Moov" },
  { key: "wave", label: "Wave", hint: "portefeuille mobile Wave" },
  { key: "card", label: "Carte Visa / Mastercard", hint: "paiement par carte bancaire" },
];

const PROVIDER_LABELS: Record<Provider, string> = {
  paystack: "Paystack",
  genius_pay: "Genius Pay",
  pawapay: "PawaPay",
};

export default function ChannelPicker({ enabledProviders }: { enabledProviders: Provider[] }) {
  const [selected, setSelected] = useState<string>("orange");
  const channel = CHANNELS.find((c) => c.key === selected)!;
  const hasGateway = enabledProviders.length > 0;

  return (
    <section className="border border-line bg-paper p-4 sm:p-6 rounded-xl">
      <h2 className="font-display text-lg font-bold text-ink">Collecte des paiements</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Où va l&apos;argent quand vos clients paient ? Sélectionnez un canal pour
        voir la passerelle qui l&apos;encaisse.
      </p>

      <div
        role="group"
        aria-label="Canaux de paiement"
        className="mt-4 flex flex-wrap gap-2"
      >
        {CHANNELS.map((c) => {
          const active = selected === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(c.key)}
              className={`border border-line px-3 py-1.5 text-sm font-bold transition-colors duration-150 ${
                active
                  ? "bg-brand text-slate-deep"
                  : "bg-paper text-ink-soft hover:bg-clay hover:text-ink"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className={`mt-4 flex items-start gap-2.5 border px-4 py-3 text-sm ${
          hasGateway ? "border-line bg-clay" : "border-warn bg-paper"
        }`}
      >
        {hasGateway ? (
          <>
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
            <p className="leading-6 text-ink">
              <span className="font-bold">{channel.label}</span> ({channel.hint}) est
              encaissé via{" "}
              <span className="marker font-bold">
                {enabledProviders.map((p) => PROVIDER_LABELS[p]).join(" + ")}
              </span>{" "}
              — l&apos;argent arrive directement sur votre compte marchand,
              SafeLinkHub ne touche jamais les fonds.
            </p>
          </>
        ) : (
          <>
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p className="leading-6 text-ink">
              Aucune passerelle active pour encaisser{" "}
              <span className="font-bold">{channel.label}</span>. Activez au moins un
              agrégateur ci-dessous : chacun couvre tous les canaux (mobile money et
              carte) en interne.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
