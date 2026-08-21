import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { fr } from "@/lib/i18n/fr";

type AuthShellProps = {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  wide?: boolean;
};

const metrics = [
  { value: "4", label: "accès distants" },
  { value: "24/7", label: "supervision" },
  { value: "0", label: "carte requise" },
] as const;

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  wide = false,
}: AuthShellProps) {
  return (
    <div className="theme-slate flex flex-1 flex-col bg-paper text-ink">
      <LandingNav anchorPrefix="/" nav={fr.nav} locale="fr" />
      <main className="flex flex-1">
        <div className="mx-auto grid min-h-[calc(100dvh-70px)] w-full max-w-6xl grid-cols-1 bg-paper lg:grid-cols-12">
          {/* Sur mobile le panneau promo est compacté (titre réduit,
              métriques masquées) pour que le formulaire — la raison d'être
              de la page — reste proche de la ligne de flottaison. */}
          <section className="flex flex-col justify-between border-b border-line bg-clay px-5 py-6 sm:px-8 lg:col-span-5 lg:min-h-[calc(100dvh-70px)] lg:border-b-0 lg:border-r lg:py-8">
            <div className="lg:py-0">
              <span className="slate-eyebrow">{eyebrow}</span>
              <h1 className="mt-5 max-w-md font-display text-3xl font-bold leading-[1.08] tracking-tight text-ink sm:text-4xl lg:text-[2.75rem]">
                {title}
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-ink-soft sm:text-base sm:leading-7 lg:mt-5">
                {description}
              </p>
            </div>

            <dl className="slate-card mt-6 hidden grid-cols-3 overflow-hidden bg-paper lg:grid">
              {metrics.map((metric, index) => (
                <div
                  key={metric.label}
                  className={`px-4 py-3 ${index > 0 ? "border-l border-line" : ""}`}
                >
                  <dt className="font-display text-xl font-bold text-ink">
                    {metric.value}
                  </dt>
                  <dd className="mt-1 text-[11px] font-semibold uppercase leading-4 text-ink-soft">
                    {metric.label}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="flex items-start justify-center px-4 py-8 sm:px-8 sm:py-12 lg:col-span-7 lg:items-center">
            <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
              <div className="slate-card slate-card-raised bg-paper p-6 sm:p-8">
                {children}
              </div>
              <div className="mt-7 text-center text-sm text-ink-soft">{footer}</div>
            </div>
          </section>
        </div>
      </main>
      <LandingFooter anchorPrefix="/" dict={fr} locale="fr" />
    </div>
  );
}
