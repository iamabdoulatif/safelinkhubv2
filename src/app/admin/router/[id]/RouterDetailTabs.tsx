"use client";

import { useId, useState } from "react";
import { Gauge, SlidersHorizontal, LayoutGrid, Stethoscope, ShieldBan, Activity } from "lucide-react";
import ResourcesPanel from "./ResourcesPanel";
import ServicesWizard from "./ServicesWizard";
import AuditPanel from "./AuditPanel";
import ContentFilterPanel from "./ContentFilterPanel";
import RegulationPanel from "./RegulationPanel";
import CaptivePortalPanel from "./CaptivePortalPanel";
import UsagePanel from "./UsagePanel";

export type TabKey = "overview" | "diagnostic" | "filter" | "usage" | "resources" | "services";

/* Ordre = fréquence d'usage : ce qu'on regarde tous les jours d'abord, la
   configuration (une fois) en dernier. */
const TABS: { key: TabKey; label: string; icon: typeof Gauge }[] = [
  { key: "overview", label: "Vue d'ensemble", icon: LayoutGrid },
  { key: "usage", label: "Consommation", icon: Activity },
  { key: "diagnostic", label: "Diagnostic", icon: Stethoscope },
  { key: "filter", label: "Filtrage & régulation", icon: ShieldBan },
  { key: "resources", label: "Ressources", icon: Gauge },
  { key: "services", label: "Configurer les services", icon: SlidersHorizontal },
];

export default function RouterDetailTabs({
  routerId,
  online,
  overview,
  initialTab = "overview",
}: {
  routerId: string;
  online: boolean;
  overview: React.ReactNode;
  /* Onglet d'arrivée, porté par ?tab= : le parc envoie « Diagnostiquer » sur
     un routeur muet, et le lien doit ouvrir le diagnostic — pas la vue
     d'ensemble, en laissant l'exploitant chercher l'onglet lui-même. */
  initialTab?: TabKey;
}) {
  const [active, setActive] = useState<TabKey>(initialTab);
  const baseId = useId();

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Sections du routeur"
        className="flex gap-2 overflow-x-auto border-b border-line pb-px"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const selected = active === key;
          return (
            <button
              key={key}
              role="tab"
              id={`${baseId}-tab-${key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${key}`}
              onClick={() => setActive(key)}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(e) => {
                // Flèches ← → entre onglets (motif ARIA « tablist »), Home/End aux bornes.
                const i = TABS.findIndex((t) => t.key === key);
                const next =
                  e.key === "ArrowRight" ? (i + 1) % TABS.length
                  : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
                  : e.key === "Home" ? 0
                  : e.key === "End" ? TABS.length - 1
                  : -1;
                if (next < 0) return;
                e.preventDefault();
                setActive(TABS[next].key);
                document.getElementById(`${baseId}-tab-${TABS[next].key}`)?.focus();
              }}
              className={`relative flex shrink-0 items-center gap-2 border border-b-0 border-line px-4 py-2 text-sm font-bold transition-colors duration-150 ${
                selected
                  ? "bg-brand text-slate-deep after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-slate-deep"
                  : "bg-paper text-ink-soft hover:bg-clay hover:text-ink"
              }`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {TABS.map(({ key }) => (
        <div
          key={key}
          role="tabpanel"
          id={`${baseId}-panel-${key}`}
          aria-labelledby={`${baseId}-tab-${key}`}
          hidden={active !== key}
          className="pt-6"
        >
          {active === key &&
            (key === "overview" ? (
              overview
            ) : !online ? (
              <p className="border border-line bg-clay px-4 py-6 text-center text-sm text-ink-soft rounded-xl">
                Le routeur doit être en ligne pour lire ses informations en direct.
              </p>
            ) : key === "diagnostic" ? (
              <AuditPanel routerId={routerId} />
            ) : key === "filter" ? (
              <div className="space-y-6">
                <ContentFilterPanel routerId={routerId} />
                <RegulationPanel routerId={routerId} />
              </div>
            ) : key === "usage" ? (
              <UsagePanel routerId={routerId} />
            ) : key === "resources" ? (
              <ResourcesPanel routerId={routerId} />
            ) : (
              <>
                <CaptivePortalPanel routerId={routerId} />
                <ServicesWizard routerId={routerId} />
              </>
            ))}
        </div>
      ))}
    </div>
  );
}
