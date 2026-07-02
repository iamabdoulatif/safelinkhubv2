"use client";

import { passwordStrength } from "@/lib/auth/password-strength";

const LABELS = {
  weak: "Faible",
  medium: "Moyen",
  strong: "Fort",
} as const;

const COLORS = {
  weak: "bg-err",
  medium: "bg-warn",
  strong: "bg-brand",
} as const;

const TEXT_COLORS = {
  weak: "text-err",
  medium: "text-warn",
  strong: "text-ok",
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
            className={`h-1.5 flex-1 transition-colors ${
              i < bars.length ? COLORS[strength] : "bg-line-soft"
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
