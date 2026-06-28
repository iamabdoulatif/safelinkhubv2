"use client";

import { useActionState, useState } from "react";
import { User, Mail, Lock, AlertCircle, Phone, Globe2, MessageCircle, Send } from "lucide-react";
import { register } from "@/lib/auth/actions";
import { COUNTRIES } from "@/lib/intl/countries";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, undefined);
  const [dialCode, setDialCode] = useState(COUNTRIES[0].dialCode);
  const [whatsappSame, setWhatsappSame] = useState(true);
  const [telegramSame, setTelegramSame] = useState(true);

  return (
    <form action={formAction} className="mt-8 animate-fade-in-up space-y-5">
      {state?.error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Nom complet</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            name="name"
            required
            autoComplete="name"
            placeholder="Jean Dupont"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="jean.dupont@exemple.com"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Mot de passe</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Confirmez le mot de passe
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={6}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Pays de résidence
        </label>
        <div className="relative">
          <Globe2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            name="country"
            required
            defaultValue={COUNTRIES[0].iso2}
            onChange={(e) => {
              const country = COUNTRIES.find((c) => c.iso2 === e.target.value);
              if (country) setDialCode(country.dialCode);
            }}
            className={`${inputClass} appearance-none pl-10`}
          >
            {COUNTRIES.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Numéro de téléphone
        </label>
        <div className="flex gap-2">
          <select
            name="phoneDialCode"
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            aria-label="Indicatif téléphonique"
            className="w-24 shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {COUNTRIES.map((c) => (
              <option key={`${c.iso2}-${c.dialCode}`} value={c.dialCode}>
                {c.dialCode}
              </option>
            ))}
          </select>
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              name="phone"
              required
              autoComplete="tel-national"
              placeholder="07 00 00 00 00"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={whatsappSame}
            onChange={(e) => setWhatsappSame(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:outline-none"
          />
          Mon numéro WhatsApp est le même que ci-dessus
        </label>
        {!whatsappSame && (
          <div className="relative mt-2">
            <MessageCircle className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              name="whatsapp"
              placeholder="Numéro WhatsApp (avec indicatif)"
              className={inputClass}
            />
          </div>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={telegramSame}
            onChange={(e) => setTelegramSame(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:outline-none"
          />
          Mon numéro Telegram est le même que ci-dessus
        </label>
        {!telegramSame && (
          <div className="relative mt-2">
            <Send className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              name="telegram"
              placeholder="Numéro Telegram (avec indicatif)"
              className={inputClass}
            />
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        {pending ? "Création du compte..." : "S'inscrire"}
      </button>
    </form>
  );
}
