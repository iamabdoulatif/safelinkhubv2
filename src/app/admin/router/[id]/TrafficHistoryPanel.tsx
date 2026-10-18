"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Download, Loader2, RefreshCw, Activity } from "lucide-react";
import {
  activateRouterTrafficGraphing,
  closeTrafficIncident,
  exportRouterTrafficHistory,
  readRouterTrafficHistory,
  recordTrafficIncident,
} from "@/lib/mikrotik/traffic-actions";
import type { TrafficIncident } from "@/lib/mikrotik/traffic-history";
import TrafficHistoryChart, {
  trafficTime,
  type ChartPeriod,
} from "./TrafficHistoryChart";

type Data = Exclude<
  Awaited<ReturnType<typeof readRouterTrafficHistory>>,
  { error: string }
>;
const dateInput = (at: number) => new Date(at).toISOString().slice(0, 16);
const parseInput = (v: string) => Date.parse(v + ":00Z");
const bytes = (n: number) =>
  `${(n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} Go`;
const KIND = {
  fup: "Limitation FUP",
  restriction: "Restriction",
  outage: "Panne / indisponibilité",
};
const SOURCE = {
  safelinkhub: "SafeLinkHub",
  mikrotik: "MikroTik",
  starlink: "Starlink",
};
const BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-bold text-ink transition hover:bg-clay disabled:cursor-not-allowed disabled:opacity-50";

export default function TrafficHistoryPanel({
  routerId,
}: {
  routerId: string;
}) {
  const [range, setRange] = useState<{ start: number; end: number }>(() => {
    const end = Date.now();
    return { start: end - 86400000, end };
  });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(false);
  const [begin, setBegin] = useState("");
  const [finish, setFinish] = useState("");
  const [cidr, setCidr] = useState("127.0.0.1/32");
  const [incident, setIncident] = useState<{
    kind: TrafficIncident["kind"];
    source: TrafficIncident["source"];
    certainty: TrafficIncident["certainty"];
    evidence: string;
    begin: string;
    finish: string;
  }>({
    kind: "fup",
    source: "starlink",
    certainty: "suspected",
    evidence: "",
    begin: "",
    finish: "",
  });
  const load = useCallback(async () => {
    if (!range) return;
    const result = await readRouterTrafficHistory(
      routerId,
      range.start,
      range.end,
    );
    if ("error" in result) throw new Error(result.error);
    setData(result);
    setSelected((old) =>
      result.links.some((l) => l.id === old)
        ? old
        : (result.links[0]?.id ?? ""),
    );
  }, [routerId, range]);
  useEffect(() => {
    let cancelled = false;
    if (!range) return;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
        setError("");
      }
    });
    readRouterTrafficHistory(routerId, range.start, range.end)
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setError(result.error ?? "Historique indisponible.");
          setData(null);
        } else {
          setData(result);
          setSelected((old) =>
            result.links.some((l) => l.id === old)
              ? old
              : (result.links[0]?.id ?? ""),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Historique indisponible. Réessayez dans un instant.");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routerId, range]);
  const run = (
    task: () => Promise<{ error?: string; ok?: boolean }>,
    success: string,
  ) =>
    start(async () => {
      setMessage("");
      try {
        const result = await task();
        if (result.error) {
          setMessage(result.error ?? "Export indisponible.");
          return;
        }
        await load();
        setMessage(success);
      } catch {
        setMessage("L’opération n’a pas abouti. Veuillez réessayer.");
      }
    });
  const link = data?.links.find((l) => l.id === selected);
  const periods: ChartPeriod[] = data
    ? [...data.observed, ...data.incidents].filter(
        (p) => !p.linkId || p.linkId === selected,
      )
    : [];
  const download = () =>
    start(async () => {
      if (!range) return;
      setMessage("");
      try {
        const result = await exportRouterTrafficHistory(
          routerId,
          range.start,
          range.end,
        );
        if ("error" in result) {
          setMessage(result.error ?? "Export indisponible.");
          return;
        }
        const url = URL.createObjectURL(
          new Blob([result.csv], { type: "text/csv;charset=utf-8" }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `trafic-${routerId}-${new Date(range.start).toISOString().slice(0, 10)}.csv`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        setMessage("Export indisponible. Réessayez.");
      }
    });
  return (
    <div className="space-y-5" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Activity className="h-5 w-5 text-brand-deep" aria-hidden="true" />
            Historique du trafic
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Relevés toutes les 5 minutes · Horaires UTC · Volumes en Go décimaux
          </p>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={pending || loading || !data?.sampleCount}
          className={BUTTON}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter les relevés CSV
        </button>
      </div>
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Période de l’historique"
      >
        {[
          { days: 1, label: "24 h" },
          { days: 7, label: "7 jours" },
          { days: 30, label: "30 jours" },
        ].map((p) => (
          <button
            type="button"
            key={p.days}
            onClick={() => {
              const end = Date.now();
              setCustom(false);
              setRange({ start: end - p.days * 86400000, end });
            }}
            aria-pressed={Boolean(
              !custom && range && range.end - range.start === p.days * 86400000,
            )}
            style={
              !custom && range.end - range.start === p.days * 86400000
                ? {
                    backgroundColor: "var(--brand)",
                    borderColor: "var(--brand)",
                  }
                : undefined
            }
            className={BUTTON}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setCustom(true);
            setBegin(range ? dateInput(range.start) : "");
            setFinish(range ? dateInput(range.end) : "");
          }}
          aria-pressed={custom}
          className={BUTTON}
        >
          Période personnalisée
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={loading}
          aria-label="Actualiser l’historique"
          onClick={() => {
            const end = Date.now();
            setRange(
              custom
                ? { ...range }
                : { start: end - (range.end - range.start), end },
            );
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {custom && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setRange({ start: parseInput(begin), end: parseInput(finish) });
          }}
        >
          <label className="text-sm">
            Du (UTC)
            <input
              className="field mt-1"
              type="datetime-local"
              required
              value={begin}
              onChange={(e) => setBegin(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Au (UTC)
            <input
              className="field mt-1"
              type="datetime-local"
              required
              value={finish}
              onChange={(e) => setFinish(e.target.value)}
            />
          </label>
          <button className={BUTTON}>Afficher</button>
          <p className="text-xs text-ink-soft">
            31 jours maximum par consultation. Les relevés plus anciens restent
            conservés.
          </p>
        </form>
      )}
      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-ink-soft"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement de l’historique…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-err/30 bg-err-soft p-4 text-sm text-err"
        >
          {error}
        </p>
      )}
      {data && !loading && (
        <>
          {!data.links.length ? (
            <p className="rounded-xl border border-line bg-paper p-5 text-sm text-ink-soft">
              Aucune liaison Starlink identifiée. Configurez les interfaces dans
              Régulation → Budget Starlink par liaison, ou indiquez le type
              Starlink dans Consommation.
            </p>
          ) : (
            <label className="block max-w-sm text-sm font-semibold text-ink">
              Liaison Starlink
              <select
                className="field mt-1"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {data.links.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.interface}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!data.sampleCount && (
            <p
              role="status"
              className="rounded-xl border border-line bg-paper p-5 text-sm text-ink-soft"
            >
              Aucun relevé sur cette période. L’historique commence à
              l’activation de cette fonction ; les données antérieures ne sont
              pas reconstituées.
            </p>
          )}
          {link && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Volume reçu",
                    text: link.measured ? bytes(link.rxBytes) : "—",
                  },
                  {
                    label: "Volume envoyé",
                    text: link.measured ? bytes(link.txBytes) : "—",
                  },
                  {
                    label: "Sessions connectées",
                    text:
                      data.latestConnected === null
                        ? "—"
                        : String(data.latestConnected),
                  },
                  {
                    label: "Sessions échangeant des données",
                    text:
                      data.latestExchanging === null
                        ? "—"
                        : String(data.latestExchanging),
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-xl border border-line bg-paper p-4"
                  >
                    <p className="text-xs text-ink-soft">{c.label}</p>
                    <p className="mt-2 text-xl font-bold tabular-nums text-ink">
                      {c.text}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-5 text-ink-soft">
                {data.latestAt
                  ? `Dernier relevé dans la période : ${trafficTime(data.latestAt)} UTC. `
                  : ""}
                Les sessions Hotspot et PPP sont comptées pour le routeur
                entier, sans attribution à une Starlink. « Échangent » signifie
                qu’un compteur de session a augmenté entre deux relevés ; une
                session terminée entre deux passages peut ne pas être comptée.
              </p>
              <p className="text-xs text-ink-soft">
                Relevés exploitables pour cette liaison : {link.measured} sur
                environ {Math.ceil((data.end - data.start) / 300000)} attendus.
                Les volumes affichés correspondent aux intervalles mesurables.
              </p>
              <TrafficHistoryChart
                points={link.points}
                title={`Débit de ${link.name} (Mbit/s)`}
                periods={periods}
              />
              <TrafficHistoryChart
                points={link.points}
                title="Sessions du routeur"
                users
                periods={periods}
              />
              <p className="text-xs leading-5 text-ink-soft">
                {data.step === 3600000
                  ? "Courbes moyennées par heure ; le CSV conserve les relevés de 5 minutes. "
                  : "Chaque point représente un relevé. "}
                Les trous ne sont pas remplacés par zéro. Les volumes mesurables
                pendant une lacune sont conservés dans le CSV avec leur durée
                réelle ; les intervalles débutant avant la période sélectionnée
                sont exclus des totaux. Les zones colorées correspondent aux
                événements ci-dessous.
              </p>
            </>
          )}
          <section className="rounded-xl border border-line bg-paper p-4 sm:p-5">
            <h3 className="font-bold text-ink">Limitations et incidents</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Une baisse de débit seule ne confirme pas un FUP Starlink. Les
              constats MikroTik et les déclarations sont distingués.
            </p>
            {!periods.length ? (
              <p className="mt-4 text-sm text-ink-soft">
                Aucun incident consigné ou constaté dans les relevés
                disponibles. Cela ne prouve pas l’absence d’incident.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line-soft">
                {periods
                  .slice()
                  .sort((a, b) => b.start - a.start)
                  .map((p, i) => (
                    <li
                      key={"id" in p ? String(p.id) : i}
                      className="space-y-2 py-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.certainty === "confirmed" ? "bg-warn-soft text-warn" : "border border-dashed border-warn text-warn"}`}
                        >
                          {p.certainty === "confirmed"
                            ? "Confirmé"
                            : "Suspecté"}
                        </span>
                        <span className="text-sm font-semibold">
                          {KIND[p.kind]} · {SOURCE[p.source]}
                        </span>
                        <span className="text-xs text-ink-soft">
                          {"id" in p ? "Déclaration" : "Constat automatique"}
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft">
                        {trafficTime(p.start)} →{" "}
                        {p.end === null ? "en cours" : trafficTime(p.end)} UTC
                        {"id" in p ? "" : " · bornes des relevés observés"}
                      </p>
                      <p className="text-sm text-ink-soft">{p.evidence}</p>
                      {"id" in p && p.end === null && data.canManage && (
                        <button
                          type="button"
                          disabled={pending}
                          className={BUTTON}
                          onClick={() =>
                            run(
                              () =>
                                closeTrafficIncident(
                                  routerId,
                                  String(p.id),
                                  Date.now(),
                                ),
                              "Fin de l’incident enregistrée.",
                            )
                          }
                        >
                          Terminer maintenant
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}
            {data.incidentsTruncated && (
              <p className="mt-3 text-sm text-warn">
                Plus de 500 déclarations sur cette période. Réduisez la période
                pour toutes les consulter.
              </p>
            )}
          </section>
          {data.canManage && (
            <>
              <details className="rounded-xl border border-line bg-paper p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-bold text-ink">
                  Consigner un incident fournisseur ou une restriction
                </summary>
                <form
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () =>
                        recordTrafficIncident(routerId, {
                          linkId: selected,
                          kind: incident.kind,
                          source: incident.source,
                          certainty: incident.certainty,
                          evidence: incident.evidence,
                          start: parseInput(incident.begin),
                          end: incident.finish
                            ? parseInput(incident.finish)
                            : null,
                        }),
                      "Événement enregistré avec sa source.",
                    );
                  }}
                >
                  <label className="text-sm">
                    Type
                    <select
                      className="field mt-1"
                      value={incident.kind}
                      onChange={(e) =>
                        setIncident((v) => ({
                          ...v,
                          kind: e.target.value as TrafficIncident["kind"],
                        }))
                      }
                    >
                      {Object.entries(KIND).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Source
                    <select
                      className="field mt-1"
                      value={incident.source}
                      onChange={(e) =>
                        setIncident((v) => ({
                          ...v,
                          source: e.target.value as TrafficIncident["source"],
                        }))
                      }
                    >
                      {Object.entries(SOURCE).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Qualification
                    <select
                      className="field mt-1"
                      value={incident.certainty}
                      onChange={(e) =>
                        setIncident((v) => ({
                          ...v,
                          certainty: e.target
                            .value as TrafficIncident["certainty"],
                        }))
                      }
                    >
                      <option value="suspected">Suspecté</option>
                      <option value="confirmed">
                        Confirmé par un constat explicite
                      </option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Début (UTC)
                    <input
                      className="field mt-1"
                      type="datetime-local"
                      required
                      value={incident.begin}
                      onChange={(e) =>
                        setIncident((v) => ({ ...v, begin: e.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Fin (UTC, vide si en cours)
                    <input
                      className="field mt-1"
                      type="datetime-local"
                      value={incident.finish}
                      onChange={(e) =>
                        setIncident((v) => ({ ...v, finish: e.target.value }))
                      }
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    Source du constat / référence
                    <textarea
                      className="field mt-1"
                      required
                      minLength={5}
                      maxLength={1000}
                      placeholder="Ex. : message du compte Starlink, alerte de l’antenne, constat terrain…"
                      value={incident.evidence}
                      onChange={(e) =>
                        setIncident((v) => ({ ...v, evidence: e.target.value }))
                      }
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={pending || !selected}
                    style={{
                      backgroundColor: "var(--brand)",
                      borderColor: "var(--brand)",
                    }}
                    className={`${BUTTON} text-slate-deep sm:col-span-2`}
                  >
                    Enregistrer pour la liaison sélectionnée
                  </button>
                </form>
              </details>
              <details className="rounded-xl border border-line bg-paper p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-bold text-ink">
                  Graphiques natifs MikroTik
                </summary>
                <p className="mt-3 text-sm leading-6 text-ink-soft">
                  Active l’historique local des interfaces suivies, avec
                  sauvegarde toutes les 5 minutes. L’historique central
                  SafeLinkHub fonctionne indépendamment. L’accès aux graphiques
                  locaux est réservé au réseau privé de gestion indiqué
                  ci-dessous ; le service web du routeur reste inchangé.
                </p>
                {data.graphing && (
                  <p className="mt-2 text-sm text-ok">
                    Activation demandée le{" "}
                    {trafficTime(Date.parse(data.graphing.at))} UTC pour{" "}
                    {data.graphing.interfaces.join(", ")} ·{" "}
                    {data.graphing.allowAddress}. État à revérifier après une
                    restauration de configuration.
                  </p>
                )}
                <form
                  className="mt-4 flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () => activateRouterTrafficGraphing(routerId, cidr),
                      "Graphiques MikroTik activés.",
                    );
                  }}
                >
                  <label className="text-sm">
                    Réseau privé autorisé (CIDR IPv4)
                    <input
                      className="field mt-1"
                      required
                      value={cidr}
                      onChange={(e) => setCidr(e.target.value)}
                      placeholder="10.0.0.0/24"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={pending || !data.links.length}
                    className={BUTTON}
                  >
                    Activer les graphiques
                  </button>
                </form>
                <p className="mt-2 text-xs text-ink-soft">
                  127.0.0.1/32 limite l’accès au routeur lui-même. Indiquez
                  votre réseau de gestion pour consulter les pages /graphs/
                  depuis ce réseau.
                </p>
              </details>
            </>
          )}
        </>
      )}
      {pending && (
        <p role="status" className="text-sm text-ink-soft">
          Enregistrement en cours…
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-lg border border-line bg-paper p-4 text-sm text-ink"
        >
          {message}
        </p>
      )}
    </div>
  );
}
