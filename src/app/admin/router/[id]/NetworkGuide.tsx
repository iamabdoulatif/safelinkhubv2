import { Globe, Cpu, Network, Wifi, Laptop, Printer, ArrowDown } from "lucide-react";
import { SWITCH_CATALOG, formatPriceRange } from "@/lib/mikrotik/switch-catalog";

/**
 * Guide de raccordement affiché sous le constat « Port(s) à 100 Mbps »
 * (finding id `eth-100m`) : ce défaut n'a pas de correctif distant (câble /
 * appareil / topologie sur site), on donne donc à l'utilisateur le schéma
 * Box FAI → MikroTik → Switch et une recommandation de switch gigabit.
 *
 * Les modèles/prix viennent du catalogue éditable `switch-catalog.ts`.
 * Purement présentationnel (pas d'état) : repliable via <details> natif.
 */

const CRITICAL_LINKS: { link: string; need: string; trap: string }[] = [
  {
    link: "① Box → MikroTik (WAN)",
    need: "Cat5e/Cat6, port gigabit des 2 côtés",
    trap: "Repérer le WAN par default-name + DHCP/route, jamais par le nom (renommé E1-WAN-FAI).",
  },
  {
    link: "② MikroTik → Switch (uplink)",
    need: "Cat6, un seul câble",
    trap: "Deux câbles switch↔MikroTik = boucle réseau (tempête de broadcast).",
  },
  {
    link: "③ Switch → appareils",
    need: "Cat5e/Cat6 + appareil gigabit",
    trap: "C'est ici que le port tombe à 100 Mbps : changer d'abord le câble, sinon l'appareil est du 100M pur.",
  },
];

function Node({
  icon: Icon,
  role,
  name,
  sub,
  hub = false,
}: {
  icon: typeof Globe;
  role: string;
  name: string;
  sub: string;
  hub?: boolean;
}) {
  return (
    <div
      className={`w-full max-w-xs border-2 bg-paper px-4 py-2.5 text-center ${
        hub ? "border-brand" : "border-line"
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`mx-auto h-5 w-5 ${hub ? "text-brand-deep" : "text-ink-soft"}`}
      />
      <p className="mt-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-ink-soft">
        {role}
      </p>
      <p className="font-display text-sm font-bold text-ink">{name}</p>
      <p className="text-[11px] text-ink-soft">{sub}</p>
    </div>
  );
}

function Wire({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <ArrowDown aria-hidden="true" className="h-4 w-4 text-brand-deep" />
      {label && (
        <span className="my-0.5 border border-line-soft bg-clay px-2 py-0.5 text-[10px] font-mono font-medium text-ink-soft">
          {label}
        </span>
      )}
    </div>
  );
}

export default function NetworkGuide() {
  return (
    <details className="group border-t-2 border-line-soft bg-clay">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm font-bold text-ink">
        <span className="flex items-center gap-2">
          <Network aria-hidden="true" className="h-4 w-4 text-brand-deep" />
          Guide de raccordement — débit optimal
        </span>
        <span className="text-[11px] font-mono font-medium text-ink-soft group-open:hidden">
          Afficher ▾
        </span>
        <span className="hidden text-[11px] font-mono font-medium text-ink-soft group-open:inline">
          Masquer ▴
        </span>
      </summary>

      <div className="space-y-5 border-t border-line-soft bg-paper px-4 py-5">
        {/* ── Schéma de raccordement ── */}
        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-ink">
            Schéma : Box FAI → MikroTik → Switch
          </h4>
          <div className="flex flex-col items-center border-2 border-line bg-clay px-3 py-4">
            <Node icon={Globe} role="Fournisseur d'accès" name="Box FAI" sub="Mode bridge de préférence" />
            <Wire label="① Cat5e/6 · 1 Gbps" />
            <Node
              icon={Cpu}
              role="Passerelle · Hotspot MikHmon"
              name="MikroTik"
              sub="WAN = entrée · LAN = sortie"
              hub
            />
            <Wire label="② Cat6 · 1 Gbps · 1 seul câble" />
            <Node icon={Network} role="Distribution" name="Switch gigabit" sub="TP-Link LS1005G / UGREEN UM106X" hub />
            <Wire />
            <div className="grid w-full max-w-md grid-cols-3 gap-2">
              {[
                { icon: Wifi, label: "AP / Wi-Fi" },
                { icon: Laptop, label: "Client filaire" },
                { icon: Printer, label: "Autre appareil" },
              ].map((c) => (
                <div key={c.label} className="border-2 border-line bg-paper px-2 py-2 text-center">
                  <c.icon aria-hidden="true" className="mx-auto h-4 w-4 text-ink-soft" />
                  <p className="mt-0.5 text-[11px] font-medium text-ink">{c.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Règle d'or ── */}
          <div className="mt-3 border-2 border-dashed border-brand bg-brand/10 px-3 py-2.5">
            <p className="text-[13px] text-ink">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-brand-deep">
                Règle d&apos;or ·{" "}
              </span>
              Le switch se place <b>APRÈS</b> le MikroTik (côté LAN), jamais entre la Box et le
              MikroTik — sinon les clients contournent le portail captif (pas de paiement, pas de
              voucher).
            </p>
          </div>
        </div>

        {/* ── Options de switch ── */}
        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-ink">Quel switch gigabit choisir</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {SWITCH_CATALOG.switches.map((s) => (
              <div
                key={s.model}
                className={`flex flex-col border-2 bg-paper p-3.5 ${
                  s.recommended ? "border-brand" : "border-line"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                    {s.brand}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wide ${
                      s.recommended ? "bg-brand text-[#1C1917]" : "border border-line-soft text-ink-soft"
                    }`}
                  >
                    {s.badge}
                  </span>
                </div>
                <p className="mt-1 font-display text-base font-bold text-ink">{s.model}</p>
                <p className="font-mono text-[13px] font-bold text-brand-deep">{formatPriceRange(s)}</p>
                <ul className="mt-2.5 space-y-1">
                  {s.specs.map((spec) => (
                    <li key={spec} className="flex gap-2 text-[13px] text-ink-soft">
                      <span aria-hidden="true" className="font-mono font-bold text-brand-deep">
                        ·
                      </span>
                      {spec}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 border-t border-line-soft pt-2.5 text-[12px] text-ink-soft">
                  {s.verdict}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Liens critiques ── */}
        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-ink">Les 3 liens critiques</h4>
          <div className="divide-y divide-line-soft border-2 border-line bg-paper">
            {CRITICAL_LINKS.map((l) => (
              <div key={l.link} className="px-3 py-2.5">
                <p className="font-mono text-[12px] font-bold text-brand-deep">{l.link}</p>
                <p className="mt-0.5 text-[13px] text-ink">{l.need}</p>
                <p className="mt-0.5 text-[12px] text-ink-soft">
                  <span className="font-medium text-warn">Piège · </span>
                  {l.trap}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
