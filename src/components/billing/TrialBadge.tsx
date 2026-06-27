import { Sparkles } from "lucide-react";

/** "365 j restants" reads as a countdown clock for what's actually a
 * year-long trial — years/months read at a glance, days only for short
 * trials where a day actually matters. */
function humanizeDaysRemaining(days: number): string {
  if (days >= 365) {
    const years = Math.round(days / 365);
    return `${years} an${years > 1 ? "s" : ""} restant${years > 1 ? "s" : ""}`;
  }
  if (days >= 30) {
    const months = Math.round(days / 30);
    return `${months} mois restant${months > 1 ? "s" : ""}`;
  }
  return `${days} j restant${days > 1 ? "s" : ""}`;
}

/** Small animated pill used wherever a free-trial state needs to be visible at a glance. */
export default function TrialBadge({
  active,
  daysRemaining,
  activeLabel = "Essai gratuit",
  endedLabel = "Essai terminé",
}: {
  active: boolean;
  daysRemaining?: number;
  activeLabel?: string;
  endedLabel?: string;
}) {
  if (active) {
    return (
      <span className="animate-fade-slide-up inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-emerald-200">
        <Sparkles className="h-3.5 w-3.5" />
        {activeLabel}
        {typeof daysRemaining === "number" && (
          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[11px] font-medium">
            {humanizeDaysRemaining(daysRemaining)}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="animate-fade-slide-up inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
      {endedLabel}
    </span>
  );
}
