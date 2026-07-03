"use client";

import { useId, useState } from "react";
import { Gauge, SlidersHorizontal, LayoutGrid } from "lucide-react";
import ResourcesPanel from "./ResourcesPanel";
import ServicesWizard from "./ServicesWizard";

type TabKey = "overview" | "resources" | "services";

const TABS: { key: TabKey; label: string; icon: typeof Gauge }[] = [
  { key: "overview", label: "Vue d'ensemble", icon: LayoutGrid },
  { key: "resources", label: "Ressources", icon: Gauge },
  { key: "services", label: "Configurer les services", icon: SlidersHorizontal },
];

export default function RouterDetailTabs({
  routerId,
  online,
  overview,
}: {
  routerId: string;
  online: boolean;
  overview: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("overview");
  const baseId = useId();

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Sections du routeur"
        className="flex gap-2 overflow-x-auto border-b-2 border-line pb-px"
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
              className={`flex shrink-0 items-center gap-2 border-2 border-b-0 border-line px-4 py-2 text-sm font-bold transition-colors duration-150 ${
                selected
                  ? "bg-brand text-[#1C1917]"
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
              <p className="border-2 border-line bg-clay px-4 py-6 text-center text-sm text-ink-soft">
                Le routeur doit être en ligne pour lire ses informations en direct.
              </p>
            ) : key === "resources" ? (
              <ResourcesPanel routerId={routerId} />
            ) : (
              <ServicesWizard routerId={routerId} />
            ))}
        </div>
      ))}
    </div>
  );
}
