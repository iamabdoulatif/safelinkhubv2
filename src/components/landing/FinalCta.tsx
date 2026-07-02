import Link from "next/link";

export default function FinalCta() {
  return (
    <section aria-label="Créer un compte" className="border-b-2 border-line bg-brand">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-16 sm:px-6 sm:py-24 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-[#1C1917] sm:text-5xl md:text-6xl">
            Prêt à automatiser votre réseau&nbsp;?
          </h2>
          <p className="mt-5 text-base font-medium text-[#44403C]">
            Commencez gratuitement. Aucune carte bancaire requise.
          </p>
        </div>
        <Link
          href="/auth/register"
          className="shrink-0 border-2 border-[#1C1917] bg-[#1C1917] px-8 py-4 text-base font-bold text-paper hover:bg-brand hover:text-[#1C1917]"
        >
          Créer un compte gratuit
        </Link>
      </div>
    </section>
  );
}
