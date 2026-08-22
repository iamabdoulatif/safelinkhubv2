import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import ContactForm from "./ContactForm";
import MapEmbed from "@/components/landing/MapEmbed";
import { LifeBuoy, MapPin, Phone } from "lucide-react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePrefix, type Locale } from "@/lib/i18n/config";

export const metadata: Metadata = {
  title: "Contact | SafeLinkHub",
  description:
    "Contactez l'équipe SafeLinkHub — questions sur le produit, partenariats ou assistance avant-vente.",
};

export async function ContactPageContent({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);
  const t = dict.contact;

  return (
    <div className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        {/* En-tête centré, trois repères, puis carte et formulaire côte à
            côte — la structure du modèle, dans la charte Slate : aplats et
            traits fins, aucun dégradé. */}
        <section className="border-b border-line bg-clay py-14">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
            <span className="slate-eyebrow">{t.eyebrow}</span>
            <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              {t.title}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ink-soft">{t.lead}</p>
          </div>

          {/* Trois repères VRAIS. Le modèle affiche e-mail et téléphone ;
              aucun des deux n'est publié aujourd'hui, et en inventer se
              paierait au premier visiteur qui composerait le numéro. */}
          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-4 px-4 sm:px-6 md:grid-cols-3">
            {[
              { icon: MapPin, label: t.cards.addressLabel, value: t.cards.addressValue },
              {
                icon: Phone,
                label: t.cards.phoneLabel,
                value: t.cards.phoneValue,
                // tel: sans espaces — un numéro composable d'un clic sur mobile.
                href: "tel:+2250505592052",
              },
              { icon: LifeBuoy, label: t.cards.supportLabel, value: t.cards.supportValue, href: "/admin/support" },
            ].map(({ icon: Icone, label, value, href }) => {
              const contenu = (
                <>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-clay text-brand-deep">
                    <Icone aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                      {label}
                    </span>
                    <span className="mt-1 block text-sm font-medium leading-6 text-ink">{value}</span>
                  </span>
                </>
              );
              return href ? (
                <a
                  key={label}
                  href={href}
                  className="slate-card flex items-center gap-4 bg-paper p-5 transition-colors hover:bg-clay"
                >
                  {contenu}
                </a>
              ) : (
                <div key={label} className="slate-card flex items-center gap-4 bg-paper p-5">
                  {contenu}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* La carte prend la moitié gauche, comme dans le modèle : dans
                l'ancienne colonne latérale de 5/12 elle était trop petite
                pour situer quoi que ce soit. */}
            <div className="lg:col-span-5">
              {locale === "fr" ? <MapEmbed /> : <MapEmbed locale="en" t={t.map} />}
            </div>
            <div className="lg:col-span-7">
              <ContactForm locale={locale} t={t.form} />
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="slate-card bg-clay p-6">
              <h2 className="font-display text-lg font-bold text-ink">{t.customerTitle}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t.customerText}</p>
              <a
                href="/admin/support"
                className="slate-btn slate-btn-ghost mt-4 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm"
              >
                {t.openSupport}
              </a>
            </div>
            <div className="slate-card bg-paper p-6">
              <h2 className="font-display text-lg font-bold text-ink">{t.responseTitle}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t.responseText}</p>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter anchorPrefix={localePrefix(locale) || "/"} dict={dict} locale={locale} />
    </div>
  );
}

export default async function ContactPage() {
  return <ContactPageContent locale="fr" />;
}
