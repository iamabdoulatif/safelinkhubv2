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
import {
  RESELLER_PACK_FCFA,
  RESELLER_QUOTA,
  RESELLER_SETUP_FEE_CENTS,
} from "@/lib/billing/reseller";
import { generateStrongPasswordExample } from "@/lib/auth/password-strength";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { fieldClass, labelClass, buttonClass, errorClass } from "@/components/auth/form-classes";
import type { Locale } from "@/lib/i18n/config";
import type { AuthDictionary } from "@/lib/i18n/auth";

const fmtFcfa = (cents: number) => `${new Intl.NumberFormat("fr-FR").format(cents)} FCFA`;

const iconClass = "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft";

const choiceClass =
  "h-4 w-4 accent-brand focus:outline-none focus:ring-4 focus:ring-brand/35";

export default function RegisterForm({
  locale,
  t,
  referralCode = "",
  referrerName = null,
}: {
  locale: Locale;
  t: AuthDictionary["register"];
  /** Code porté par le lien /auth/register?ref=… (déjà normalisé). */
  referralCode?: string;
  /** Nom du parrain si le code correspond à une org, sinon null. */
  referrerName?: string | null;
}) {
  const [state, formAction, pending] = useActionState(register, undefined);
  const [dialCode, setDialCode] = useState(COUNTRIES[0].dialCode);
  const [whatsappSame, setWhatsappSame] = useState(true);
  const [telegramSame, setTelegramSame] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordExample, setPasswordExample] = useState(t.passwordExample);

  // Generated client-side only (crypto.getRandomValues) so the SSR markup
  // and the first client render match — it then swaps in a real mixed-
  // character example as a placeholder, never auto-filled into the field.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPasswordExample(generateStrongPasswordExample());
  }, []);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      <input type="hidden" name="locale" value={locale} />
      {/* Parrainage : le code voyage en champ caché pour survivre à une erreur
          de validation (le formulaire est re-rendu, la query string non). */}
      {referralCode && <input type="hidden" name="referralCode" value={referralCode} />}
      {referralCode && (
        <div className="rounded-lg border border-brand bg-brand/25 px-3 py-2.5 text-sm font-semibold text-ink">
          {referrerName ? (
            <>
              {t.invitedByStart} <span className="marker">{referrerName}</span>{t.invitedByEnd}
            </>
          ) : (
            <>
              {t.referralStart} <span className="font-mono">{referralCode}</span> {t.referralEnd}
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
        <label className={labelClass}>{t.name}</label>
        <div className="relative">
          <User className={iconClass} />
          <input
            type="text"
            name="name"
            required
            autoComplete="name"
            placeholder={t.namePlaceholder}
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>{t.email}</label>
        <div className="relative">
          <Mail className={iconClass} />
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder={t.emailPlaceholder}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t.password}</label>
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
              aria-label={showPassword ? t.hidePassword : t.showPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <PasswordStrengthMeter password={password} />
        </div>
        <div>
          <label className={labelClass}>
            {t.confirmPassword}
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
              aria-label={showConfirmPassword ? t.hidePassword : t.showPassword}
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
                ? t.passwordsMatch
                : t.passwordsMismatch}
            </p>
          )}
        </div>
      </div>

      {/* Type de compte. C'est une DEMANDE : cocher « revendeur » n'ouvre pas
          le tarif remisé, le pack doit être payé (voir lib/billing/reseller.ts).
          Le prix est importé, jamais recopié — il ne peut pas diverger du
          montant réellement débité. */}
      <fieldset>
        <legend className={labelClass}>{t.accountType}</legend>
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-4 has-[:checked]:border-brand-deep has-[:checked]:bg-brand/15">
            <input
              type="radio"
              name="accountType"
              value="user"
              defaultChecked
              className="mt-0.5 h-4 w-4 shrink-0 accent-slate-deep"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{t.user}</span>
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {t.userDetail}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-4 has-[:checked]:border-brand-deep has-[:checked]:bg-brand/15">
            <input
              type="radio"
              name="accountType"
              value="reseller"
              className="mt-0.5 h-4 w-4 shrink-0 accent-slate-deep"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">
                {t.reseller}
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-soft">
                {/* Un SEUL nœud texte par montant : ce Next avale l'espace
                    entre {expr} et le texte adjacent au rendu serveur — d'où
                    « 40 000FCFA » sinon. Même contournement que Pricing.tsx. */}
                {`${t.resellerDetail} Pack ${fmtFcfa(RESELLER_PACK_FCFA)} / an: ${RESELLER_QUOTA} installations at ${fmtFcfa(RESELLER_SETUP_FEE_CENTS)} instead of ${fmtFcfa(10000)}.`}
              </span>
              <span className="mt-1.5 block text-xs font-semibold text-brand-deep">
                {t.resellerPayment}
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div>
        <label className={labelClass}>
          {t.country}
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
          {t.phone}
        </label>
        <div className="flex gap-2">
          <select
            name="phoneDialCode"
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            aria-label={t.phoneCode}
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
              placeholder={t.phonePlaceholder}
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
          {t.whatsappSame}
        </label>
        {!whatsappSame && (
          <div className="relative mt-2">
            <MessageCircle className={iconClass} />
            <input
              type="tel"
              name="whatsapp"
              placeholder={t.whatsappPlaceholder}
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
          {t.telegramSame}
        </label>
        {!telegramSame && (
          <div className="relative mt-2">
            <Send className={iconClass} />
            <input
              type="tel"
              name="telegram"
              placeholder={t.telegramPlaceholder}
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
        {pending ? t.pending : t.submit}
      </button>
    </form>
  );
}
