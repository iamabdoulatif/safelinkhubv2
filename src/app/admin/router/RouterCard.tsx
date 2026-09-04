"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import RouterRowActions from "./RouterRowActions";
import { isOfflineRouter } from "./fleet-health";
import { isConfiguringRouter } from "./router-portfolio";
import { timeAgo, type RouterDictionary, type RouterRow } from "./router-row";

/** Métrique lisible d'un coup d'œil : le nombre domine, l'intitulé s'efface. */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</p>
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
  const online = r.status === "online";
  const configuring = isConfiguringRouter(r.status);
  const offline = isOfflineRouter(r.status);

  return (
    <li className="slate-card bg-paper p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* L'état ne repose pas sur la seule pastille : le mot est écrit à
              côté, pour qui ne distingue pas le vert du rouge. */}
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${online ? "bg-ok" : configuring ? "bg-warn" : "bg-err"}`}
            />
            <span className={online ? "text-ok" : configuring ? "text-warn" : "text-err"}>
              {online ? table.online : configuring ? table.configuring : table.offline}
            </span>
            {r.locked && (
              <span className="ml-1 rounded-full bg-err px-2 py-0.5 text-[10px] font-semibold text-white">
                {table.locked}
              </span>
            )}
          </p>
          <Link
            href={`/admin/router/${r.id}`}
            className="mt-1 block truncate font-display text-base font-semibold text-ink hover:text-brand-deep"
          >
            {r.name}
          </Link>
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
        className={`mt-3 flex min-h-11 items-center justify-center gap-1.5 px-4 text-sm slate-btn ${
          offline ? "slate-btn-dark" : "slate-btn-ghost"
        }`}
      >
        {offline ? t.fleet.diagnose : t.fleet.details}
        <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </li>
  );
}
