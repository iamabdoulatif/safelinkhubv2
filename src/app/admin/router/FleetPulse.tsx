import type { FleetHealth, FleetRouterLike } from "./fleet-health";
import type { RouterDictionary } from "./router-row";

/**
 * L'état du parc en une bande, avant toute liste.
 *
 * Les trois nombres étaient jusqu'ici PORTÉS PAR LES FILTRES : le même objet
 * disait « il y a 10 routeurs en ligne » et « clique pour ne voir qu'eux ».
 * Un chiffre de supervision et une commande ne peuvent pas partager la même
 * apparence — on lit le premier, on actionne la seconde. Ici : que du constat,
 * aucun clic.
 */
export function FleetPulse({
  health,
  t,
  table,
}: {
  health: FleetHealth<FleetRouterLike>;
  t: RouterDictionary["fleet"];
  table: RouterDictionary["table"];
}) {
  const cells: Array<{ key: string; label: string; value: number; dot?: string }> = [
    { key: "total", label: t.monitored, value: health.total },
    { key: "online", label: table.online, value: health.online, dot: "bg-ok" },
    { key: "offline", label: table.offline, value: health.offline, dot: "bg-err" },
  ];
  // La colonne « configuration » n'apparaît QUE si elle est peuplée : à zéro,
  // elle occupait un quart de la bande pour ne rien dire.
  if (health.configuring > 0) {
    cells.push({ key: "config", label: table.configuring, value: health.configuring, dot: "bg-warn" });
  }

  return (
    <section
      aria-label={t.monitored}
      className="slate-card slate-card-raised overflow-hidden bg-paper"
    >
      <dl className={`grid divide-y divide-line sm:divide-x sm:divide-y-0 ${cells.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {cells.map((cell) => (
          <div key={cell.key} className="px-3 py-3 sm:px-5 sm:py-4">
            <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              {cell.dot && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${cell.dot}`} />}
              <span className="truncate">{cell.label}</span>
            </dt>
            <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-ink sm:text-3xl">
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>

      {health.availability !== null && (
        <div className="border-t border-line px-3 py-3 sm:px-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              {t.availability}
            </span>
            <span className="font-display text-sm font-semibold tabular-nums text-ink">
              {health.availability.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
            </span>
          </div>
          {/* La barre DOUBLE le pourcentage écrit à côté : elle est donc
              décorative, et le lecteur d'écran n'a pas à l'annoncer deux fois. */}
          <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-clay">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${
                health.availability >= 99 ? "bg-ok" : health.availability >= 80 ? "bg-brand-deep" : "bg-err"
              }`}
              style={{ width: `${Math.max(2, health.availability)}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
