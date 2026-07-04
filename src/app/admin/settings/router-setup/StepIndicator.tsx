import { ChevronRight } from "lucide-react";

const STEP_LABELS: Record<number, string> = {
  1: "Connexion",
  2: "Topologie",
  3: "Auto-config",
};

export default function StepIndicator({
  steps,
  currentStep,
}: {
  steps: number[];
  currentStep: number;
}) {
  return (
    <div className="mt-4 flex items-center justify-center gap-1 sm:gap-1.5">
      {steps.map((step, i) => {
        const done = step < currentStep;
        const active = step === currentStep;
        return (
          <div key={step} className="flex items-center gap-1 sm:gap-1.5">
            <div className="flex flex-col items-center gap-1">
              <div
                key={active ? `active-${currentStep}` : undefined}
                className={`flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-all duration-300 ${
                  active
                    ? "animate-scale-in bg-brand text-ink ring-2 ring-ink shadow-sm"
                    : done
                      ? "bg-brand text-ink"
                      : "bg-clay text-ink-soft"
                }`}
              >
                {step}
              </div>
              <span
                className={`hidden sm:block text-[10px] font-medium tracking-wide uppercase ${
                  active ? "text-ink" : done ? "text-ink-soft" : "text-ink-soft/60"
                }`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${done ? "text-brand" : "text-clay"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
