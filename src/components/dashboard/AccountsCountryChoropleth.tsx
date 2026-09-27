"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { CountryRow } from "@/lib/dashboard/geography";
import { colorBucket, countryMetrics, totalAccounts } from "@/lib/dashboard/choropleth";

type Props = { countries: CountryRow[] };
type FeatureProperties = { ISO_A2?: string; name?: string };
type WorldGeoJson = FeatureCollection<Geometry, FeatureProperties>;

const COLORS = ["#D8D2C6", "#F7E7B0", "#EAB308", "#A16207", "#6B4604"] as const;

function percent(share: number) {
  return `${Math.round(share * 100)} %`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

export default function AccountsCountryChoropleth({ countries }: Props) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletGeoJSON | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedIso2, setSelectedIso2] = useState<string | null>(null);
  const maxAccounts = Math.max(0, ...countries.filter((c) => c.iso2).map((c) => c.accounts));
  const total = totalAccounts(countries);
  const selected = selectedIso2 ? countryMetrics(countries, selectedIso2) : undefined;
  const summary = useMemo(() => countries.filter((country) => country.iso2).slice(0, 8), [countries]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!mapNode.current) return;
      try {
        const [{ default: L }, response] = await Promise.all([
          import("leaflet"),
          fetch("/maps/world-countries.geojson"),
        ]);
        if (!response.ok) throw new Error("GeoJSON unavailable");
        const geo = (await response.json()) as WorldGeoJson;
        if (cancelled || !mapNode.current) return;
        const map = L.map(mapNode.current, { zoomControl: true, attributionControl: false, minZoom: 1, maxZoom: 4, worldCopyJump: true }).setView([16, 0], 1.35);
        const layer = L.geoJSON(geo, {
          style: (feature) => {
            const iso2 = feature?.properties?.ISO_A2 ?? "";
            const metric = countryMetrics(countries, iso2);
            return { color: "#FBFAF8", weight: 0.7, fillColor: COLORS[colorBucket(metric?.accounts ?? 0, maxAccounts)], fillOpacity: 0.9 };
          },
          onEachFeature: (feature, countryLayer) => {
            const iso2 = feature.properties?.ISO_A2 ?? "";
            const metric = countryMetrics(countries, iso2);
            const label = metric?.label ?? feature.properties?.name ?? "Pays";
            countryLayer.bindTooltip(`<strong>${escapeHtml(label)}</strong><br>${metric ? `${metric.accounts} comptes · ${percent(metric.share)}` : "Aucun compte"}`, { sticky: true, className: "sfl-map-tooltip" });
            countryLayer.on({
              mouseover: (event) => event.target.setStyle({ color: "#1C1917", weight: 1.4 }),
              mouseout: (event) => layer.resetStyle(event.target),
              click: () => { if (iso2) setSelectedIso2(iso2); },
            });
          },
        }).addTo(map);
        mapRef.current = map;
        layerRef.current = layer;
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
      layerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [countries, maxAccounts]);

  return (
    <section className="rounded-xl border border-line bg-paper p-5" aria-labelledby="accounts-map-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="accounts-map-title" className="text-base font-semibold text-ink">Comptes par pays</h2>
          <p className="mt-1 text-xs text-ink-soft">Répartition mondiale des comptes de la plateforme</p>
        </div>
        <span className="text-xs text-ink-soft">{total} au total</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-slate-deep">
        <div ref={mapNode} className={`sfl-account-map ${state === "loading" ? "sfl-account-map-loading" : ""}`} aria-label="Carte mondiale des comptes par pays" />
        {state === "loading" && <p className="px-4 py-2 text-center text-xs text-paper/80">Chargement de la carte…</p>}
        {state === "error" && <p role="alert" className="border-t border-err bg-err-soft px-4 py-2 text-xs text-err">La carte n’a pas pu être chargée. Le résumé reste disponible ci-dessous.</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-soft" aria-label="Légende">
        <span className="font-semibold text-ink">Intensité</span>
        {COLORS.map((color, index) => <span key={color} className="inline-flex items-center gap-1"><i aria-hidden="true" className="h-3 w-3 border border-line-soft" style={{ backgroundColor: color }} />{index === 0 ? "Aucun" : index === 4 ? "Très élevé" : index === 1 ? "Faible" : index === 2 ? "Moyen" : "Élevé"}</span>)}
      </div>
      {selected && <p className="mt-3 border-l-2 border-brand bg-clay px-3 py-2 text-sm text-ink"><strong>{selected.label}</strong> · {selected.accounts} comptes · {percent(selected.share)}</p>}
      <ul className="mt-4 grid gap-x-6 gap-y-1 border-t border-line-soft pt-3 text-xs text-ink-soft sm:grid-cols-2" aria-label="Résumé des comptes par pays">
        {summary.map((country) => <li key={country.iso2} className="flex justify-between gap-3"><span>{country.flag} {country.label}</span><span className="font-semibold tabular-nums text-ink">{country.accounts} · {percent(country.share)}</span></li>)}
        {countries.filter((country) => !country.iso2).map((country) => <li key="unknown" className="flex justify-between gap-3 italic"><span>— {country.label}</span><span className="font-semibold tabular-nums not-italic text-ink">{country.accounts} · {percent(country.share)}</span></li>)}
      </ul>
    </section>
  );
}
