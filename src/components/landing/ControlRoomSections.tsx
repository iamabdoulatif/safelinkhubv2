import Image from "next/image";
import { Activity, Banknote, Clock, Cpu, Gauge, KeyRound, Router as RouterIcon, Ticket, Users, Wrench } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";

/*
 * Les trois sections « Control Room » qui suivent le film du hero :
 *   1. Un réseau, un cockpit — encore dans le noir du film ;
 *   2. Les opérations qui avancent seules — on repasse sur le papier ;
 *   3. Chaque site vous répond — la console réelle du parc.
 *
 * HONNÊTETÉ : SafeLinkHub pilote le MikroTik (API RouterOS). Les points d'accès
 * Ruijie ou TP-Link ne sont pas pilotés directement : ils servent leurs
 * clients À TRAVERS le hotspot du MikroTik, donc le portail, les forfaits et
 * la supervision des sessions. La section le dit tel quel.
 */

/** Lignes de l'aperçu. Photos de public/mikrotik ; charge en pourcentage. */
const APERCU = [
  { name: "ZONE-MARCHE", model: "hAP ax²", img: "/mikrotik/hap-ax2.webp", status: "online", cpu: 18 },
  { name: "CAMPUS-NORD", model: "RB5009", img: "/mikrotik/rb5009.webp", status: "online", cpu: 42 },
  { name: "RESIDENCE-B", model: "Chateau Pro", img: "/mikrotik/chato.webp", status: "online", cpu: 27 },
  { name: "KIOSQUE-GARE", model: "hAP be lite", img: "/mikrotik/hap-be-lite.webp", status: "setup", cpu: 9 },
] as const;

const VENDOR_ICONS = [RouterIcon, Activity, Activity];
const AUTOPILOT_ICONS = [Wrench, Ticket, Banknote, Clock];
const METRIC_ICONS = [Gauge, Cpu, Activity, Users, KeyRound];

export function CockpitSection({ dict }: { dict: Dictionary }) {
  const t = dict.controlRoom.cockpit;
  return (
    <section aria-label={t.aria} className="relative overflow-hidden bg-[#080A0E] py-20 text-white sm:py-28">
      <Image
        src="/landing/control-room/network.webp"
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-35"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#080A0E]/60" />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#A5F32E]">{t.eyebrow}</p>
        <h2 className="mt-4 max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">{t.title}</h2>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/65">{t.lead}</p>
        <ul role="list" className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
          {t.vendors.map((v, i) => {
            const Icon = VENDOR_ICONS[i] ?? Activity;
            return (
              <li key={v.name} className="reveal bg-[#080A0E]/90 p-6 sm:p-7">
                <Icon aria-hidden="true" className="h-5 w-5 text-[#A5F32E]" />
                <p className="mt-5 text-lg font-semibold">{v.name}</p>
                <p className="text-sm text-white/50">{v.role}</p>
                <ul role="list" className="mt-5 space-y-2 text-sm text-white/75">
                  {v.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#A5F32E]" />
                      {p}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function AutopilotSection({ dict }: { dict: Dictionary }) {
  const t = dict.controlRoom.autopilot;
  return (
    <section aria-label={t.aria} className="border-b border-line bg-paper py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-brand-deep">{t.eyebrow}</p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-5xl">{t.title}</h2>
          <div className="relative mt-10 aspect-[16/9] overflow-hidden rounded-2xl bg-[#080A0E]">
            <Image src="/landing/control-room/ports.webp" alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
          </div>
        </div>
        <ul role="list" className="stagger grid gap-4 sm:grid-cols-2">
          {t.items.map((item, i) => {
            const Icon = AUTOPILOT_ICONS[i] ?? Wrench;
            return (
              <li key={item.title} className="reveal rounded-2xl border border-line bg-paper p-6">
                <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-deep text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{item.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function SitesSection({ dict }: { dict: Dictionary }) {
  const t = dict.controlRoom.sites;
  const c = dict.hero; // la console illustrée garde ses libellés d'origine
  return (
    <section aria-label={t.aria} className="border-b border-line bg-clay py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-brand-deep">{t.eyebrow}</p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-5xl">{t.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-ink-soft">{t.lead}</p>
          <ul role="list" className="mt-8 flex flex-wrap gap-2">
            {t.metrics.map((m, i) => {
              const Icon = METRIC_ICONS[i] ?? Activity;
              return (
                <li key={m} className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-2 text-sm text-ink">
                  <Icon aria-hidden="true" className="h-4 w-4 text-brand-deep" />
                  {m}
                </li>
              );
            })}
          </ul>
        </div>
      <figure className="reveal reveal-scale relative min-w-0">
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-2xl border border-line bg-paper shadow-modal"
        >
          <div className="flex h-10 items-center gap-2 border-b border-line bg-clay px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            <span className="ml-3 truncate rounded-md bg-paper px-3 py-0.5 font-mono text-[11px] text-ink-soft">
              safelinkhub.io/admin/router
            </span>
          </div>

          {/* Pas de menu latéral ici : en demi-largeur, il tronquait les noms des routeurs. */}
          <div>
            

            <div className="min-w-0 p-4 text-left sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-lg font-bold text-ink">{c.console.title}</p>
                <span className="inline-flex h-8 items-center rounded-full bg-slate-deep px-3.5 text-xs font-semibold text-white">
                  {c.console.action}
                </span>
              </div>

              <ul className="mt-5 divide-y divide-line-soft rounded-xl border border-line">
                {APERCU.map((r) => {
                  const online = r.status === "online";
                  return (
                    <li key={r.name} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                      <Image
                        src={r.img}
                        alt=""
                        width={40}
                        height={40}
                        className="h-9 w-9 shrink-0 rounded-lg border border-line-soft bg-clay object-contain p-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                        <span className="block truncate text-xs text-ink-soft">{r.model}</span>
                      </span>
                      <span
                        className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${
                          online ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-ok" : "bg-warn"}`} />
                        {online ? c.console.online : c.console.setup}
                      </span>
                      <span className="hidden w-24 shrink-0 items-center gap-2 sm:flex">
                        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-line-soft">
                          <span className="block h-full rounded-full bg-brand-deep" style={{ width: `${r.cpu}%` }} />
                        </span>
                        <span className="text-xs tabular-nums text-ink-soft">{r.cpu} %</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
        <figcaption className="mt-3 text-center text-xs text-ink-soft">{c.console.caption}</figcaption>
      </figure>
      </div>
    </section>
  );
}
