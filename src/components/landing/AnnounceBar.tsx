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
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6 md:justify-between">
        <p className="text-center text-xs font-medium text-slate-deep-soft md:text-left">
          <span className="text-white">{dict.announce.trial(VPN_TRIAL_DAYS)}</span>
          <span className="hidden sm:inline">{dict.announce.detail}</span>{" "}
          <Link
            href={localeHref("/auth/register", locale)}
            className="font-semibold text-brand underline-offset-2 hover:underline"
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
