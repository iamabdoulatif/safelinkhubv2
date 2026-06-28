"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Loader2, Wand2, X } from "lucide-react";
import { changePassword } from "@/lib/auth/actions";
import { generateStrongPassword } from "@/lib/auth/generate-password";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-slate-700">
          Mot de passe actuel
        </label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-700">
            Nouveau mot de passe
          </label>
          <button
            type="button"
            onClick={() => {
              const generated = generateStrongPassword();
              setNewPassword(generated);
              setShowNewPassword(true);
            }}
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
          >
            <Wand2 className="h-3 w-3" />
            Générer
          </button>
        </div>
        <div className="relative">
          <input
            id="new-password"
            name="newPassword"
            type={showNewPassword ? "text" : "password"}
            required
            minLength={6}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Au moins 8 caractères, varié"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => setShowNewPassword((v) => !v)}
            aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrengthMeter password={newPassword} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Mise à jour..." : "Changer le mot de passe"}
        </button>
        <div role="status" aria-live="polite" className="text-xs">
          {!pending && state?.success && (
            <span className="flex items-center gap-1 text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Mot de passe modifié.
            </span>
          )}
          {!pending && state && !state.success && (
            <span className="flex items-center gap-1 text-red-600">
              <X className="h-3.5 w-3.5" /> {state.error}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
