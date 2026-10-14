import Link from "next/link";
import { VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";
import AuthHidden from "./AuthHidden";
// Même liste qu'en pied de page : deux copies auraient divergé au premier
// réseau ajouté (c'est ce qui est arrivé avec YouTube).
import { SITE_SOCIALS } from "@/lib/site/contact";

/** Bandeau d'annonce vert profond, en tête de page — le motif d'ouverture de
 * Slate. Le nombre de jours vient de la config de facturation, pas d'un
 * littéral : si l'essai change, le bandeau suit, dans les deux langues.
 *
 * Bandeau de PROMO pour créer un compte : inutile — et à ne pas montrer — à un
 * utilisateur déjà connecté. On le masque dès le premier rendu via le
 * cookie-indice (non secret), puis /api/session confirme. */
export default function AnnounceBar({ dict, locale }: { dict: Dictionary; locale: Locale }) {

  return (
      <div className="bg-slate-deep text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6 md:justify-between">
        <p className="text-center text-xs font-medium leading-5 text-slate-deep-soft md:text-left">
          <span className="text-white">{dict.announce.trial(VPN_TRIAL_DAYS)}</span>
          <span className="hidden sm:inline">{dict.announce.detail}</span>
          <span aria-hidden="true" className="px-1.5 sm:hidden">
            ·
          </span>{" "}
          <AuthHidden>
            <Link
              href={localeHref("/auth/register", locale)}
              className="inline-block py-1.5 font-semibold text-brand underline-offset-2 hover:underline"
            >
              {dict.announce.cta}
            </Link>
          </AuthHidden>
        </p>
        <nav aria-label={dict.announce.socials} className="hidden items-center gap-4 lg:flex">
          {SITE_SOCIALS.map((reseau) => (
            <a
              key={reseau.label}
              href={reseau.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center text-xs font-medium text-slate-deep-soft hover:text-white"
            >
              {reseau.label}
            </a>
          ))}
        </nav>
      </div>
      </div>
  );
}
