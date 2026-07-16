import Link from "next/link";
import { Check } from "lucide-react";
import SectionHeading from "./SectionHeading";
import {
  REMOTE_ACCESS_SERVICES,
  BILLING_PERIODS,
  remoteAccessPriceFcfa,
} from "@/lib/billing/remote-access-gate-config";
import {
  AUTO_SETUP_FEE_CENTS,
  VPN_TRIAL_DAYS,
} from "@/lib/billing/auto-setup-pricing";

const fcfa = new Intl.NumberFormat("fr-FR");
const price = (n: number) => `${fcfa.format(n)} FCFA`;

/*
 * Section Tarifs — 100 % données réelles (importées de la config de
 * facturation : remote-access-gate-config.ts + auto-setup-pricing.ts). Aucun
 * chiffre en dur : si la grille change dans le code, la landing suit.
 */
export default function Pricing() {
  return (
    <section
      id="tarifs"
      aria-label="Tarifs"
      className="border-b-2 border-line bg-paper py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading index="05" title="Des tarifs clairs, sans surprise." marker="clairs" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Accès distant — grille de prix (identique pour les 4 services) */}
          <div className="frame-double bg-paper lg:col-span-7">
            <div className="border-b-2 border-line bg-ink px-5 py-4">
              <h3 className="font-display text-xl font-bold text-paper">Accès distant sécurisé</h3>
              <p className="mt-1 font-mono text-xs text-clay">
                Tunnel chiffré vers votre MikroTik, par service et par durée.
              </p>
            </div>

            <ul className="flex flex-wrap gap-2 border-b-2 border-line px-5 py-4">
              {REMOTE_ACCESS_SERVICES.map((s) => (
                <li
                  key={s.id}
                  className="border-2 border-line bg-clay px-2.5 py-1 font-mono text-xs font-semibold text-ink"
                >
                  {s.label}
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-2 sm:grid-cols-4">
              {BILLING_PERIODS.map((p, i) => (
                <div
                  key={p.id}
                  className={`p-5 text-center ${
                    i > 0 ? "border-t-2 border-line sm:border-l-2 sm:border-t-0" : ""
                  } ${i >= 2 ? "border-t-2 sm:border-t-0" : ""}`}
                >
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                    {p.label}
                  </p>
                  <p className="mt-2 whitespace-nowrap font-mono text-lg font-bold tabular-nums text-ink">
                    {price(remoteAccessPriceFcfa(p.id))}
                  </p>
                </div>
              ))}
            </div>

            <p className="border-t-2 border-line bg-clay px-5 py-3 font-mono text-xs text-ink-soft">
              Même tarif pour chaque service. Prix par service et par période.
            </p>
          </div>

          {/* Auto-setup + essai gratuit */}
          <div className="flex flex-col gap-6 lg:col-span-5">
            <div className="frame-double bg-paper">
              <div className="border-b-2 border-line bg-brand px-5 py-4">
                <h3 className="font-display text-xl font-bold text-[#1C1917]">
                  Installation auto-setup
                </h3>
                <p className="mt-1 font-mono text-xs text-[#1C1917]/70">
                  Configuration complète du routeur en un clic.
                </p>
              </div>
              <div className="grid grid-cols-1 divide-y-2 divide-line">
                <div className="flex items-baseline justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">Routeur Hotspot + MikHmon</p>
                    <p className="text-xs text-ink-soft">Cartes compatibles conteneur</p>
                  </div>
                  <span className="whitespace-nowrap font-mono text-lg font-bold tabular-nums text-ink">
                    {price(AUTO_SETUP_FEE_CENTS.containerCapable)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">Hotspot seul</p>
                    <p className="text-xs text-ink-soft">Matériel plus léger (RB951…)</p>
                  </div>
                  <span className="whitespace-nowrap font-mono text-lg font-bold tabular-nums text-ink">
                    {price(AUTO_SETUP_FEE_CENTS.hotspotOnly)}
                  </span>
                </div>
              </div>
              <p className="border-t-2 border-line bg-clay px-5 py-3 font-mono text-xs text-ink-soft">
                Frais unique · <span className="font-semibold text-ink">1er routeur offert</span> · liage et tunnel gratuits.
              </p>
            </div>

            <div className="frame-double bg-ink p-5 text-paper">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-brand">
                Offert au démarrage
              </p>
              {/* Template literal en un seul nœud texte : ce Next avale
                  l'espace entre {expr} et le texte adjacent au SSR
                  (« 10<!-- -->jours »), d'où « 10jours » à l'écran sinon. */}
              <p className="mt-2 font-display text-2xl font-bold">
                {`${VPN_TRIAL_DAYS} jours d'accès distant gratuits`}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-clay">
                {["WinBox, WebFig, SSH/SFTP & MikHmon inclus", "Vouchers WiFi illimités", "Aucune carte requise"].map(
                  (line) => (
                    <li key={line} className="flex items-start gap-2">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      {line}
                    </li>
                  ),
                )}
              </ul>
              <Link
                href="/auth/register"
                className="mt-5 inline-block border-2 border-brand bg-brand px-5 py-2.5 text-sm font-bold text-[#1C1917] hover:bg-paper hover:text-ink"
              >
                Commencer gratuitement
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
