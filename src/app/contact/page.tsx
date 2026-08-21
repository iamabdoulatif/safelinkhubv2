import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import ContactForm from "./ContactForm";
import MapEmbed from "@/components/landing/MapEmbed";
import { fr } from "@/lib/i18n/fr";

export const metadata: Metadata = {
  title: "Contact | SafeLinkHub",
  description:
    "Contactez l'équipe SafeLinkHub — questions sur le produit, partenariats ou assistance avant-vente.",
};

export default function ContactPage() {
  return (
    <div className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix="/" nav={fr.nav} locale="fr" />
      <main className="flex-1 bg-paper">
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <span className="slate-eyebrow">Entreprise</span>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Contactez-nous
          </h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            Une question sur le produit, un partenariat ou un déploiement à
            grande échelle ? Écrivez-nous, nous répondons rapidement.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ContactForm />
            </div>

            <aside className="space-y-4 lg:col-span-5">
              <div className="slate-card bg-clay p-6">
                <h2 className="font-display text-lg font-bold text-ink">
                  Déjà client ?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Pour toute question liée à votre compte ou à vos routeurs,
                  passez par l&apos;onglet Support de votre tableau de bord :
                  votre demande sera rattachée à votre organisation.
                </p>
                <a
                  href="/admin/support"
                  className="slate-btn slate-btn-ghost mt-4 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm"
                >
                  Ouvrir le support
                </a>
              </div>
              <div className="slate-card bg-paper p-6">
                <h2 className="font-display text-lg font-bold text-ink">
                  Délai de réponse
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  Nous traitons les messages du lundi au samedi. Comptez en
                  général moins de 24&nbsp;heures ouvrées pour une première
                  réponse.
                </p>
              </div>
            </aside>
          </div>

          {/* Pleine largeur : dans la colonne latérale (5/12, ~400 px) la carte
              aurait été trop petite pour situer quoi que ce soit. */}
          <div className="mt-8">
            <MapEmbed />
          </div>
        </section>
      </main>
      <LandingFooter anchorPrefix="/" dict={fr} locale="fr" />
    </div>
  );
}
