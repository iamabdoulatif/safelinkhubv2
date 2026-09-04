"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { timeAgo, type RouterDictionary, type RouterRow } from "./router-row";
import type { FleetHealth } from "./fleet-health";

/** Combien de routeurs en panne on nomme avant de renvoyer vers le filtre. */
const NOMMES = 3;

/**
 * « À surveiller » — la seule section qui a le droit d'être colorée.
 *
 * Un routeur tombé était jusqu'ici une ligne parmi les autres, à égalité
 * visuelle avec dix routeurs sains : l'exploitant devait le CHERCHER dans sa
 * propre liste. Il est maintenant nommé en haut, avec l'action qu'on veut
 * réellement faire dessus — diagnostiquer, pas consulter une fiche.
 *
 * ⚠️ On écrit « vu il y a X », jamais « hors ligne depuis X » : le statut
 * vient d'un balayage périodique, pas d'une surveillance continue. Nous ne
 * connaissons pas l'heure de la chute, seulement la dernière réponse.
 */
export function FleetAttention({
  health,
  t,
  table,
  onShowOffline,
}: {
  health: FleetHealth<RouterRow>;
  t: RouterDictionary["fleet"];
  table: RouterDictionary["table"];
  onShowOffline: () => void;
}) {
  if (health.total === 0) return null;

  if (health.attention.length === 0) {
    return (
      <section className="slate-card flex items-start gap-3 bg-ok-soft px-4 py-3">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{t.allGood}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {t.allGoodText
              .replace("{online}", String(health.online))
              .replace("{total}", String(health.total))}
          </p>
        </div>
      </section>
    );
  }

  const nommes = health.attention.slice(0, NOMMES);
  const titre =
    health.attention.length === 1
      ? t.attentionOne
      : t.attentionMany.replace("{count}", String(health.attention.length));

  return (
    <section aria-label={titre} className="slate-card overflow-hidden bg-err-soft">
      <p className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-ink">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-err" />
        {titre}
      </p>

      <ul role="list" className="divide-y divide-line border-t border-line bg-paper">
        {nommes.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-soft">
                {r.model ? `${r.model} · ` : ""}
                <span suppressHydrationWarning>
                  {r.lastSyncAtMs
                    ? t.seen.replace("{ago}", timeAgo(r.lastSyncAtMs, table))
                    : t.neverSeen}
                </span>
              </p>
            </div>
            <Link
              href={`/admin/router/${r.id}?tab=diagnostic`}
              className="slate-btn slate-btn-dark inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-xs"
            >
              {t.diagnose}
              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
      </ul>

      {health.attention.length > NOMMES && (
        <button
          type="button"
          onClick={onShowOffline}
          className="flex min-h-11 w-full items-center justify-center border-t border-line bg-paper px-4 text-xs font-semibold text-ink hover:bg-clay"
        >
          {t.showAllOffline.replace("{count}", String(health.attention.length))}
        </button>
      )}
    </section>
  );
}
