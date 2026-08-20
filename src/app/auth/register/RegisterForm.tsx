"use client";

import { useActionState, useEffect, useState } from "react";
import {
  User,
  Mail,
  Lock,
  AlertCircle,
  Phone,
  Globe2,
  ChevronDown,
  MessageCircle,
  Send,
  Eye,
  EyeOff,
} from "lucide-react";
import { register } from "@/lib/auth/actions";
import { COUNTRIES, countryFlag } from "@/lib/intl/countries";
import { generateStrongPasswordExample } from "@/lib/auth/password-strength";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { fieldClass, labelClass, buttonClass, errorClass } from "@/components/auth/form-classes";

const iconClass = "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft";

const choiceClass =
  "h-4 w-4 accent-brand focus:outline-none focus:ring-4 focus:ring-brand/35";

export default function RegisterForm({
  referralCode = "",
  referrerName = null,
}: {
  /** Code porté par le lien /auth/register?ref=… (déjà normalisé). */
  referralCode?: string;
  /** Nom du parrain si le code correspond à une org, sinon null. */
  referrerName?: string | null;
} = {}) {
  const [state, formAction, pending] = useActionState(register, undefined);
  const [dialCode, setDialCode] = useState(COUNTRIES[0].dialCode);
  const [whatsappSame, setWhatsappSame] = useState(true);
  const [telegramSame, setTelegramSame] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordExample, setPasswordExample] = useState("Au moins 8 caractères, varié");

  // Generated client-side only (crypto.getRandomValues) so the SSR markup
  // and the first client render match — it then swaps in a real mixed-
  // character example as a placeholder, never auto-filled into the field.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasswordExample(generateStrongPasswordExample());
  }, []);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      {/* Parrainage : le code voyage en champ caché pour survivre à une erreur
          de validation (le formulaire est re-rendu, la query string non). */}
      {referralCode && <input type="hidden" name="referralCode" value={referralCode} />}
      {referralCode && (
        <div className="rounded-lg border border-brand bg-brand/25 px-3 py-2.5 text-sm font-semibold text-ink">
          {referrerName ? (
            <>
              Vous avez été invité par <span className="marker">{referrerName}</span>.
            </>
          ) : (
            <>
              Code de parrainage <span className="font-mono">{referralCode}</span> — il sera vérifié
              à la création du compte.
            </>
          )}
        </div>
      )}

      {state?.error && (
        <div className={errorClass}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className={labelClass}>Nom complet</label>
        <div className="relative">
          <User className={iconClass} />
          <input
            type="text"
            name="name"
            required
            autoComplete="name"
            placeholder="Jean Dupont"
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Email</label>
        <div className="relative">
          <Mail className={iconClass} />
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="jean.dupont@exemple.com"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Mot de passe</label>
          <div className="relative">
            <Lock className={iconClass} />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={passwordExample}
              className={`${fieldClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <PasswordStrengthMeter password={password} />
        </div>
        <div>
          <label className={labelClass}>
            Confirmez le mot de passe
          </label>
          <div className="relative">
            <Lock className={iconClass} />
            <input
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`${fieldClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword && (
            <p
              className={`mt-1.5 text-xs font-medium ${
                confirmPassword === password ? "text-ok" : "text-err"
              }`}
            >
              {confirmPassword === password
                ? "Les mots de passe correspondent."
                : "Les mots de passe ne correspondent pas."}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Pays de résidence
        </label>
        <div className="relative">
          <Globe2 className={iconClass} />
          <select
            name="country"
            required
            defaultValue={COUNTRIES[0].iso2}
            onChange={(e) => {
              const country = COUNTRIES.find((c) => c.iso2 === e.target.value);
              if (country) setDialCode(country.dialCode);
            }}
            className={`${fieldClass} appearance-none pl-10 pr-10`}
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {countryFlag(c.iso2)} {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Numéro de téléphone
        </label>
        <div className="flex gap-2">
          <select
            name="phoneDialCode"
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            aria-label="Indicatif téléphonique"
            className="w-24 shrink-0 rounded-lg border border-line bg-paper px-2 py-3 text-sm text-ink focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {COUNTRIES.map((c) => (
              <option key={`${c.iso2}-${c.dialCode}`} value={c.dialCode}>
                {countryFlag(c.iso2)} {c.dialCode}
              </option>
            ))}
          </select>
          <div className="relative flex-1">
            <Phone className={iconClass} />
            <input
              type="tel"
              name="phone"
              required
              autoComplete="tel-national"
              placeholder="07 00 00 00 00"
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
          <input
            type="checkbox"
            checked={whatsappSame}
            onChange={(e) => setWhatsappSame(e.target.checked)}
            className={choiceClass}
          />
          Mon numéro WhatsApp est le même que ci-dessus
        </label>
        {!whatsappSame && (
          <div className="relative mt-2">
            <MessageCircle className={iconClass} />
            <input
              type="tel"
              name="whatsapp"
              placeholder="Numéro WhatsApp (avec indicatif)"
              className={fieldClass}
            />
          </div>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-ink-soft">
          <input
            type="checkbox"
            checked={telegramSame}
            onChange={(e) => setTelegramSame(e.target.checked)}
            className={choiceClass}
          />
          Mon numéro Telegram est le même que ci-dessus
        </label>
        {!telegramSame && (
          <div className="relative mt-2">
            <Send className={iconClass} />
            <input
              type="tel"
              name="telegram"
              placeholder="Numéro Telegram (avec indicatif)"
              className={fieldClass}
            />
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className={buttonClass}
      >
        {pending ? "Création du compte..." : "S'inscrire"}
      </button>
    </form>
  );
}
