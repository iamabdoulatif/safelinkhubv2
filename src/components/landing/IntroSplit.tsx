import Link from "next/link";
import { ArrowRight } from "lucide-react";

/* Le « split éditorial » de Slate : gros titre à gauche, paragraphe et lien
 * à droite. Sert de respiration entre le hero et les sections denses. */
export default function IntroSplit() {
  return (
    <section aria-label="Notre approche" className="border-b border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16">
        <h2 className="font-display text-3xl font-bold leading-[1.15] tracking-tight text-ink sm:text-4xl lg:col-span-6 md:text-[2.75rem]">
          Un seul script à coller.
          <br />
          Le reste, la plateforme s&apos;en charge.
        </h2>
        <div className="lg:col-span-6 lg:pt-3">
          <p className="text-base leading-7 text-ink-soft">
            Pas de technicien à envoyer sur site, pas de configuration RouterOS à
            écrire à la main. Vous collez le script d&apos;installation dans le
            terminal du routeur&nbsp;: SafeLinkHub pose le hotspot, les profils de
            forfaits, le portail captif et le tunnel de supervision, puis commence
            à encaisser.
          </p>
          <Link
            href="#demo"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-deep underline-offset-4 hover:underline"
          >
            Voir comment
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
