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
              className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                active
                  ? "bg-emerald-500 text-white ring-2 ring-emerald-200"
                  : done
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {step}
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                className={`h-4 w-4 shrink-0 ${done ? "text-emerald-400" : "text-slate-300"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
