import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact | SafeLinkHub",
  description:
    "Contactez l'équipe SafeLinkHub — questions sur le produit, partenariats ou assistance avant-vente.",
};

export default function ContactPage() {
  return (
    <div className="flex flex-1 flex-col">
      <LandingNav anchorPrefix="/" />
      <main className="flex-1 bg-paper">
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-brand-deep">
            Entreprise
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink">Contactez-nous</h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            Une question sur le produit, un partenariat ou un déploiement à
            grande échelle ? Écrivez-nous, nous répondons rapidement.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ContactForm />
            </div>

            <aside className="space-y-4 lg:col-span-5">
              <div className="border-2 border-line bg-clay p-6">
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
                  className="mt-4 inline-block border-2 border-line bg-paper px-4 py-2 text-sm font-bold text-ink hover:bg-brand hover:text-[#1C1917]"
                >
                  Ouvrir le support
                </a>
              </div>
              <div className="border-2 border-line bg-paper p-6">
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
        </section>
      </main>
      <LandingFooter anchorPrefix="/" />
    </div>
  );
}
