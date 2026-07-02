import Link from "next/link";
import Logo from "@/components/landing/Logo";

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
    <main className="flex flex-1 bg-paper text-ink">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl grid-cols-1 border-x-2 border-line bg-paper lg:grid-cols-12">
        <section className="flex min-h-[300px] flex-col justify-between border-b-2 border-line bg-clay px-5 py-5 sm:px-8 lg:col-span-5 lg:min-h-dvh lg:border-b-0 lg:border-r-2">
          <Link href="/" aria-label="SafeLinkHub — accueil" className="w-fit">
            <Logo />
          </Link>

          <div className="py-10 lg:py-0">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-soft">
              {eyebrow}
            </p>
            <h1 className="mt-5 max-w-md font-display text-4xl font-extrabold leading-[1.05] text-ink sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-ink-soft">
              {description}
            </p>
          </div>

          <dl className="grid grid-cols-3 border-2 border-line bg-paper">
            {metrics.map((metric, index) => (
              <div
                key={metric.label}
                className={`px-3 py-3 ${index > 0 ? "border-l-2 border-line" : ""}`}
              >
                <dt className="font-display text-xl font-extrabold text-ink">
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
            <div className="frame-double bg-paper p-5 sm:p-7">
              {children}
            </div>
            <div className="mt-7 text-center text-sm text-ink-soft">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
