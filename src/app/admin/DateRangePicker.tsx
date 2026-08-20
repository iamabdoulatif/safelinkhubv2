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
      className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`}
      role="group"
      aria-label="Période du tableau de bord"
    >
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          aria-pressed={activePreset === p.key}
          onClick={() => applyPreset(p.key)}
          className={`border border-line px-3 py-1.5 text-xs font-bold transition-colors duration-150 ${
            activePreset === p.key
              ? "bg-brand text-slate-deep"
              : "bg-paper text-ink-soft hover:bg-clay hover:text-ink"
          }`}
        >
          {p.label}
        </button>
      ))}
      <span className="mx-1 hidden h-5 w-px bg-line-soft sm:block" aria-hidden="true" />
      <label className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        Du
        <input
          type="date"
          name="from"
          value={from}
          max={to}
          onChange={(e) => apply(e.target.value, to)}
          className="border border-line bg-paper px-2 py-1 font-mono text-xs text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded-xl"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        au
        <input
          type="date"
          name="to"
          value={to}
          min={from}
          onChange={(e) => apply(from, e.target.value)}
          className="border border-line bg-paper px-2 py-1 font-mono text-xs text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink rounded-xl"
        />
      </label>
    </div>
  );
}
