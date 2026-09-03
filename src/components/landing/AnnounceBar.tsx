import Link from "next/link";
import { VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";

const socials = [
  { href: "https://x.com/safelinkhub", label: "X" },
  { href: "https://linkedin.com/company/safelinkhub", label: "LinkedIn" },
  { href: "https://tiktok.com/@safelinkhub", label: "TikTok" },
] as const;

/** Bandeau d'annonce vert profond, en tête de page — le motif d'ouverture de
 * Slate. Le nombre de jours vient de la config de facturation, pas d'un
 * littéral : si l'essai change, le bandeau suit, dans les deux langues. */
export default function AnnounceBar({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  return (
    <div className="bg-slate-deep text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6 md:justify-between">
        {/* Sur mobile, `detail` est masqué : sans séparateur, la phrase se
            terminait directement sur le libellé du lien (« …accès distant
            Commencer »). Le point médian rétablit la coupure, et le lien reçoit
            une vraie hauteur de doigt au lieu de ses 14 px de texte. */}
        <p className="text-center text-xs font-medium leading-5 text-slate-deep-soft md:text-left">
          <span className="text-white">{dict.announce.trial(VPN_TRIAL_DAYS)}</span>
          <span className="hidden sm:inline">{dict.announce.detail}</span>
          <span aria-hidden="true" className="px-1.5 sm:hidden">
            ·
          </span>{" "}
          <Link
            href={localeHref("/auth/register", locale)}
            className="inline-block py-1.5 font-semibold text-brand underline-offset-2 hover:underline"
          >
            {dict.announce.cta}
          </Link>
        </p>
        <nav aria-label={dict.announce.socials} className="hidden items-center gap-4 md:flex">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-slate-deep-soft hover:text-white"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
