// Boutique — extraite dans un projet à part (aura son propre landing + ses
// propres menus). Ici, page AUTONOME volontairement SANS la nav/footer du site
// principal : juste un placeholder « site en construction », qui ramène le
// visiteur à l'accueil (bouton immédiat + bascule automatique) plutôt que de le
// laisser dans un cul-de-sac.

import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag, ArrowLeft } from "lucide-react";
import HomeRedirect from "./HomeRedirect";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePrefix, type Locale } from "@/lib/i18n/config";

export const metadata: Metadata = {
  title: "Site en construction | SafeLinkHub",
  description: "La boutique d'équipement SafeLinkHub arrive bientôt.",
};

export async function BoutiquePageContent({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);
  const t = dict.boutique;
  const homeHref = localePrefix(locale) || "/";

  return (
    <main className="theme-slate flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
      <div className="mx-auto max-w-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-clay">
          <ShoppingBag className="h-8 w-8 text-ink" />
        </div>
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          {t.title}
        </h1>
        <p className="mt-3 text-base text-ink-soft">
          {t.lead}
        </p>

        <Link
          href={homeHref}
          className="slate-btn slate-btn-primary mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 text-sm"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.backHome}
        </Link>

        <HomeRedirect seconds={8} href={homeHref} t={t} />

        <p className="mt-8 text-xs font-medium uppercase tracking-wide text-ink-soft/70">
          {t.footer}
        </p>
      </div>
    </main>
  );
}

export default async function BoutiquePage() {
  return <BoutiquePageContent locale="fr" />;
}
