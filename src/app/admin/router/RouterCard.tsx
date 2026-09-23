"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import RouterRowActions from "./RouterRowActions";
import { buttonClass } from "@/components/ui/Button";
import { LockedBadge, StatusBadge } from "./RouterBadges";
import RouterThumb from "@/components/RouterThumb";
import { isOfflineRouter } from "./fleet-health";
import { timeAgo, type RouterDictionary, type RouterRow } from "./router-row";

/** Métrique lisible d'un coup d'œil : le nombre domine, l'intitulé s'efface. */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="font-display text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

/**
 * Une zone, sur téléphone.
 *
 * L'ancienne carte était une FICHE : six paires intitulé/valeur en corps 12,
 * toutes de même poids, douze lignes pour dire « ce routeur va bien ». On lit
 * maintenant dans l'ordre où l'on décide — l'état, le nom, ce que la zone
 * porte (utilisateurs, CPU, RAM), puis une seule action, CONTEXTUELLE :
 * consulter un routeur sain, diagnostiquer un routeur muet.
 */
export function RouterCard({
  r,
  t,
  canLock,
}: {
  r: RouterRow;
  t: RouterDictionary;
  canLock: boolean;
}) {
  const table = t.table;
  const offline = isOfflineRouter(r.status);

  return (
    <li className="rounded-xl border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* L'état ne repose pas sur la seule pastille : le mot est écrit à
              côté, pour qui ne distingue pas le vert du rouge. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={r.status} t={table} />
            {r.locked && <LockedBadge t={table} />}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <RouterThumb model={r.model} size={40} />
            <Link
              href={`/admin/router/${r.id}`}
              className="block min-w-0 truncate text-base font-semibold text-ink hover:text-brand-deep"
            >
              {r.name}
            </Link>
          </div>
          <p className="truncate text-xs text-ink-soft">
            {r.model ?? "—"}
            {r.host ? <span className="font-mono"> · {r.host}:{r.apiPort ?? 8728}</span> : null}
          </p>
        </div>
        <RouterRowActions
          routerId={r.id}
          routerName={r.name}
          t={t.actions}
          canLock={canLock}
          locked={Boolean(r.locked)}
        />
      </div>

      {/* Un routeur muet ne publie pas de CPU crédible : afficher « CPU 0 % »
          ferait passer une absence de mesure pour une mesure. */}
      {!offline && (
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line-soft pt-3">
          <Metric label={table.users} value={String(r.activeUsers ?? 0)} />
          <Metric label={table.cpu} value={`${r.cpuLoad ?? 0} %`} />
          <Metric label={table.ram} value={`${Math.round(Number(r.memoryUsage ?? 0))} %`} />
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
        <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span className="sr-only">{table.location}</span>
        <span className="truncate">{r.location || table.locationMissing}</span>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {table.lastSync}
        {" · "}
        {/* timeAgo lit Date.now() : le texte du serveur peut différer de
            quelques secondes à l'hydratation — écart attendu. */}
        <span suppressHydrationWarning className="text-ink">{timeAgo(r.lastSyncAtMs, table)}</span>
      </p>

      <Link
        href={offline ? `/admin/router/${r.id}?tab=diagnostic` : `/admin/router/${r.id}`}
        className={buttonClass({ variant: offline ? "secondary" : "outline", block: true, className: "mt-3" })}
      >
        {offline ? t.fleet.diagnose : t.fleet.details}
        <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </li>
  );
}
