import { ChevronRight } from "lucide-react";

export default function StepIndicator({
  steps,
  currentStep,
}: {
  steps: number[];
  currentStep: number;
}) {
  return (
    <div className="mt-6 flex items-center justify-center gap-1.5">
      {steps.map((step, i) => {
        const done = step < currentStep;
        const active = step === currentStep;
        return (
          <div key={step} className="flex items-center gap-1.5">
            <div
              // key sur l'étape courante : relance l'animation scale-in à
              // chaque changement d'étape pour marquer la progression.
              key={active ? `active-${currentStep}` : undefined}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                active
                  ? "animate-scale-in bg-brand text-[#1C1917] ring-2 ring-ink"
                  : done
                    ? "bg-brand text-[#1C1917]"
                    : "bg-clay text-ink-soft"
              }`}
            >
              {step}
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                className={`h-4 w-4 shrink-0 ${done ? "text-brand" : "text-clay"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
