"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Monitor, Search, Smartphone } from "lucide-react";
import InstallOnRouter from "./InstallOnRouter";

export type RouterPortal = {
  routerId: string;
  routerName: string;
  status: string;
  /** null = portail inconnu sur ce routeur. */
  portal: {
    templateId: string;
    templateName: string;
    entry: string;
    /** Jeton signé côté serveur (preview-token.ts). */
    token: string;
    /** Déduit (pas enregistré à l'installation) — routeurs configurés avant le suivi. */
    inferred: boolean;
  } | null;
};

type TemplateOption = { id: string; name: string; isDefault: boolean };

export function previewUrl(token: string, entry: string) {
  return `/api/portal-preview/${token}/${entry.split("/").map(encodeURIComponent).join("/")}`;
}

// Tailles d'écran simulées : le portail se met en page comme sur l'appareil,
// puis le cadre est réduit pour tenir dans le panneau.
const DEVICES = {
  mobile: { label: "Téléphone", icon: Smartphone, w: 390, h: 800, scale: 0.72 },
  desktop: { label: "Ordinateur", icon: Monitor, w: 1280, h: 800, scale: 0.46 },
} as const;
type Device = keyof typeof DEVICES;

/**
 * Maître-détail : la liste des routeurs à gauche, le portail RÉELLEMENT
 * installé sur celui choisi à droite — rendu depuis ses propres fichiers,
 * avec le SSID, les forfaits et le branding de ce routeur — et, dessous, de
 * quoi le changer. Une seule iframe à la fois, quel que soit le parc.
 */
export default function InstalledPortals({
  items,
  templates,
}: {
  items: RouterPortal[];
  templates: TemplateOption[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    () => items.find((i) => i.portal)?.routerId ?? items[0]?.routerId ?? null,
  );
  const [device, setDevice] = useState<Device>("mobile");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? items.filter(
          (i) => i.routerName.toLowerCase().includes(q) || i.portal?.templateName.toLowerCase().includes(q),
        )
      : items;
  }, [items, query]);
  const selected = items.find((i) => i.routerId === selectedId) ?? null;
  const known = items.filter((i) => i.portal).length;

  if (items.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink-soft">
        Aucun routeur dans votre organisation pour l&apos;instant.
      </p>
    );
  }

  const d = DEVICES[device];
  const pad = device === "mobile" ? 14 : 10;
  return (
    <section
      aria-label="Portails installés sur vos routeurs"
      className="mt-6 grid grid-cols-1 overflow-hidden rounded-2xl border border-line bg-paper lg:grid-cols-[18rem_minmax(0,1fr)]"
    >
      {/* ── Liste des routeurs ─────────────────────────────── */}
      <div className="flex min-h-0 flex-col border-b border-line bg-clay/40 lg:border-b-0 lg:border-r">
        <div className="border-b border-line p-3">
          <label className="relative block">
            <span className="sr-only">Rechercher un routeur ou un portail</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Routeur ou portail…"
              className="field pl-9"
            />
          </label>
          <p className="mt-2 px-1 text-xs text-ink-soft">
            {known} sur {items.length} routeurs avec un portail connu
          </p>
        </div>
        <ul role="list" className="max-h-72 overflow-y-auto p-2 lg:max-h-[46rem]">
          {visible.map((i) => {
            const active = i.routerId === selectedId;
            const online = i.status === "online";
            return (
              <li key={i.routerId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(i.routerId)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left ${
                    active ? "bg-paper shadow-menu" : "hover:bg-paper/70"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${online ? "bg-ok" : "bg-err"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm text-ink ${active ? "font-semibold" : ""}`}>
                      {i.routerName}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {i.portal ? i.portal.templateName : "Portail inconnu"}
                    </span>
                  </span>
                  <span className="sr-only">{online ? "en ligne" : "hors ligne"}</span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-soft">Aucun résultat.</li>}
        </ul>
      </div>

      {/* ── Détail : aperçu + actions ─────────────────────── */}
      {selected && (
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-ink">{selected.routerName}</h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
                {selected.portal ? (
                  <>
                    <span className="truncate">{selected.portal.templateName}</span>
                    {selected.portal.inferred && (
                      <span
                        className="rounded bg-clay px-1.5 py-0.5 text-[11px] font-medium"
                        title="Installé avant le suivi des portails : déduit de la configuration du routeur."
                      >
                        présumé
                      </span>
                    )}
                  </>
                ) : (
                  "Aucun portail connu sur ce routeur"
                )}
              </p>
            </div>
            {selected.portal && (
              <div className="flex items-center gap-2">
                <div
                  role="radiogroup"
                  aria-label="Taille d'écran"
                  className="hidden rounded-lg border border-line p-0.5 sm:inline-flex"
                >
                  {(Object.keys(DEVICES) as Device[]).map((k) => {
                    const { icon: Icon, label } = DEVICES[k];
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={device === k}
                        aria-label={label}
                        title={label}
                        onClick={() => setDevice(k)}
                        className={`inline-flex h-8 w-9 items-center justify-center rounded-md ${
                          device === k ? "bg-slate-deep text-white" : "text-ink-soft hover:text-ink"
                        }`}
                      >
                        <Icon aria-hidden="true" className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
                <a
                  href={previewUrl(selected.portal.token, selected.portal.entry)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline inline-flex items-center gap-1.5"
                >
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  Ouvrir en grand
                </a>
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-center overflow-hidden rounded-xl bg-clay/50 px-4 py-6">
            {selected.portal ? (
              <div
                className={`overflow-hidden border-slate-deep bg-slate-deep shadow-modal ${
                  device === "mobile" ? "rounded-[2rem] border-[7px]" : "rounded-lg border-[5px]"
                }`}
                style={{ width: d.w * d.scale + pad, height: d.h * d.scale + pad }}
              >
                <iframe
                  key={`${selected.routerId}-${device}`}
                  src={previewUrl(selected.portal.token, selected.portal.entry)}
                  title={`Portail captif de ${selected.routerName}`}
                  sandbox="allow-scripts allow-forms"
                  className="origin-top-left border-0 bg-paper"
                  style={{ width: d.w, height: d.h, transform: `scale(${d.scale})` }}
                />
              </div>
            ) : (
              <p className="max-w-sm py-16 text-center text-sm text-ink-soft">
                On ne sait pas quel portail tourne sur ce routeur (configuré hors de SafeLinkHub ou avant le
                suivi). Installez-en un ci-dessous pour le voir ici.
              </p>
            )}
          </div>

          {templates.length > 0 && (
            <div className="mt-5 border-t border-line-soft pt-5">
              <p className="mb-3 text-sm font-semibold text-ink">
                {selected.portal ? "Changer de portail" : "Installer un portail"}
              </p>
              <InstallOnRouter
                key={selected.routerId}
                routers={[{ id: selected.routerId, name: selected.routerName, status: selected.status }]}
                templates={templates}
                fixedRouterId={selected.routerId}
                currentTemplateId={selected.portal?.inferred ? null : selected.portal?.templateId}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
