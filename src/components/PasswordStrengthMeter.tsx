"use client";

import { passwordStrength } from "@/lib/auth/generate-password";

const LABELS = {
  weak: "Faible",
  medium: "Moyen",
  strong: "Fort",
} as const;

const COLORS = {
  weak: "bg-red-500",
  medium: "bg-amber-500",
  strong: "bg-emerald-500",
} as const;

const TEXT_COLORS = {
  weak: "text-red-600",
  medium: "text-amber-600",
  strong: "text-emerald-600",
} as const;

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  if (strength === "empty") return null;

  const bars: (keyof typeof COLORS)[] =
    strength === "weak" ? ["weak"] : strength === "medium" ? ["weak", "medium"] : ["weak", "medium", "strong"];

  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < bars.length ? COLORS[strength] : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className={`mt-1 text-xs font-medium ${TEXT_COLORS[strength]}`}>
        Mot de passe {LABELS[strength].toLowerCase()}
      </p>
    </div>
  );
}
