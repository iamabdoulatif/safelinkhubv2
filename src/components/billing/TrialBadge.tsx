import { Sparkles } from "lucide-react";

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
            {daysRemaining} j restant{daysRemaining > 1 ? "s" : ""}
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
