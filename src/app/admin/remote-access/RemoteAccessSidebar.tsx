"use client";

import { useEffect, useState } from "react";
import { Globe, Globe2, RotateCcw, ShieldCheck, Smartphone } from "lucide-react";

type Router = { id: string; name: string; status: string };

const SECTIONS = [
  { id: "section-tunnel",        label: "Installer un tunnel",   icon: ShieldCheck },
  { id: "section-back-to-home",  label: "Back To Home",          icon: Smartphone },
  { id: "section-direct-access", label: "Accès direct WinBox",   icon: Globe2     },
  { id: "section-ipv6-bypass",   label: "Bypass IPv6",           icon: Globe      },
  { id: "section-replacement",   label: "Remplacer un routeur",  icon: RotateCcw  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function RemoteAccessSidebar({
  routers,
  tunnelCount,
  activeForwardsCount,
  ipv6BypassCount,
  replacementCount,
}: {
  routers: Router[];
  tunnelCount: number;
  activeForwardsCount: number;
  ipv6BypassCount: number;
  replacementCount: number;
}) {
  const [activeId, setActiveId] = useState<SectionId>("section-tunnel");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id as SectionId);
        }
      },
      { rootMargin: "-10% 0% -55% 0%", threshold: 0 },
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const badges: Record<SectionId, number | null> = {
    "section-tunnel":        tunnelCount        || null,
    "section-back-to-home": routers.length      || null,
    "section-direct-access": activeForwardsCount || null,
    "section-ipv6-bypass":   ipv6BypassCount     || null,
    "section-replacement":   replacementCount    || null,
  };

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-0 space-y-0.5">
        {/* Section navigation */}
        <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-ink-soft">
          Navigation
        </p>

        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const active = activeId === id;
          const badge = badges[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                active
                  ? "bg-clay font-medium text-ink"
                  : "text-ink-soft hover:bg-clay hover:text-ink"
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`h-3.5 w-3.5 shrink-0 ${active ? "text-ok" : "text-ink-soft"}`}
              />
              <span className="flex-1 text-xs leading-tight">{label}</span>
              {badge !== null && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                    active
                      ? "bg-clay text-ok"
                      : "bg-clay text-ink-soft"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Router status */}
        {routers.length > 0 && (
          <div className="mt-5 border-t border-line-soft pt-4">
            <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-ink-soft">
              Routeurs
            </p>
            <div className="space-y-0.5">
              {routers.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md px-2.5 py-1.5">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      r.status === "online" ? "bg-ok" : "bg-line-soft"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                    {r.name}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] font-medium ${
                      r.status === "online" ? "text-ok" : "text-ink-soft"
                    }`}
                  >
                    {r.status === "online" ? "En ligne" : "Hors ligne"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
