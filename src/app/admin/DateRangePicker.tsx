"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";

function toParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const PRESETS = [
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "month", label: "Ce mois" },
] as const;

export default function DateRangePicker({
  from,
  to,
  activePreset,
}: {
  from: string;
  to: string;
  activePreset: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function apply(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return;
    startTransition(() => {
      router.replace(`${pathname}?from=${nextFrom}&to=${nextTo}`, { scroll: false });
    });
  }

  function applyPreset(key: (typeof PRESETS)[number]["key"]) {
    const now = new Date();
    const end = toParam(now);
    if (key === "month") {
      apply(toParam(new Date(now.getFullYear(), now.getMonth(), 1)), end);
    } else {
      const days = key === "7d" ? 6 : 29;
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      apply(toParam(start), end);
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 transition-opacity ${pending ? "opacity-60" : ""}`}
      role="group"
      aria-label="Période du tableau de bord"
    >
      {/* Même contrôle segmenté que les filtres du parc de routeurs. */}
      <div className="inline-flex gap-1 rounded-full bg-line-soft p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={activePreset === p.key}
            onClick={() => applyPreset(p.key)}
            className={`flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors duration-150 ${
              activePreset === p.key
                ? "border-line bg-paper font-semibold text-ink"
                : "border-transparent font-medium text-ink-soft hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
        Du
        <input
          type="date"
          name="from"
          value={from}
          max={to}
          onChange={(e) => apply(e.target.value, to)}
          className="field h-9 w-auto px-2.5 text-[13px] tabular-nums sm:h-9"
        />
      </label>
      <label className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
        au
        <input
          type="date"
          name="to"
          value={to}
          min={from}
          onChange={(e) => apply(from, e.target.value)}
          className="field h-9 w-auto px-2.5 text-[13px] tabular-nums sm:h-9"
        />
      </label>
    </div>
  );
}
