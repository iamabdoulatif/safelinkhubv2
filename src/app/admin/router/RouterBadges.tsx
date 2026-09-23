import { Lock } from "lucide-react";
import { isConfiguringRouter } from "./router-portfolio";
import type { RouterDictionary } from "./router-row";

/**
 * Pastilles d'état d'un routeur, partagées par le tableau (desktop) et les
 * cartes (mobile) : elles divergeaient — un point nu dans l'un, un mot en
 * capitales dans l'autre. L'état ne repose jamais sur la seule couleur : le
 * mot est écrit à côté du point.
 */
export function StatusBadge({ status, t }: { status: string; t: RouterDictionary["table"] }) {
  const online = status === "online";
  const config = isConfiguringRouter(status);
  const tone = online
    ? "bg-ok-soft text-ok"
    : config
      ? "bg-warn-soft text-warn"
      : "bg-err-soft text-err";
  const dot = online ? "bg-ok" : config ? "bg-warn" : "bg-err";
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${tone}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {online ? t.online : config ? t.configuring : t.offline}
    </span>
  );
}

/** Routeur « paralysé » par le kill-switch (ports coupés sauf ether1). */
export function LockedBadge({ t }: { t: RouterDictionary["table"] }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full bg-err px-2.5 text-xs font-semibold text-white">
      <Lock aria-hidden="true" className="h-3 w-3" />
      {t.locked}
    </span>
  );
}

// Au-delà, la jauge passe à l'orange : un routeur à 90 % de CPU étrangle déjà
// son portail captif (constaté sur DIAK-HSPT).
export const LOAD_WARN_PERCENT = 85;

/** Jauge CPU/RAM. `null` = pas de mesure crédible (routeur muet) → « — ». */
export function MeterCell({ percent, label }: { percent: number | null; label?: string }) {
  if (percent === null) return <span className="text-ink-soft">—</span>;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const high = clamped >= LOAD_WARN_PERCENT;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      {label && <span className="w-8 text-xs text-ink-soft">{label}</span>}
      <span aria-hidden="true" className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-line-soft">
        <span
          className={`block h-full rounded-full ${high ? "bg-warn" : "bg-brand-deep"}`}
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className={`tabular-nums ${high ? "font-semibold text-warn" : "text-ink-soft"}`}>
        {clamped} %
      </span>
    </span>
  );
}
