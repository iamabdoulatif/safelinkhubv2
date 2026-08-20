import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Logo from "./Logo";

const columns = [
  {
    title: "Produit",
    links: [
      { href: "/", label: "Accueil" },
      { href: "#features", label: "Fonctionnalités" },
      { href: "#plateforme", label: "Plateforme" },
      // Repris ici depuis la navigation principale, qu'ils saturaient : le prix
      // et la FAQ sont ce qu'un visiteur cherche en bas de page.
      { href: "#tarifs", label: "Tarifs" },
      { href: "#faq", label: "FAQ" },
      { href: "/boutique", label: "Boutique" },
      { href: "/auth/register", label: "Commencer" },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/careers", label: "Carrières" },
    ],
  },
  {
    title: "Ressources",
    links: [
      { href: "/blog", label: "Blog" },
      { href: "/legal/terms", label: "Conditions d'utilisation" },
      { href: "/legal/privacy", label: "Politique de confidentialité" },
      { href: "/support", label: "Support" },
    ],
  },
] as const;

const socials = [
  { href: "https://x.com/safelinkhub", label: "Twitter / X" },
  { href: "https://linkedin.com/company/safelinkhub", label: "LinkedIn" },
  { href: "https://tiktok.com/@safelinkhub", label: "TikTok" },
] as const;

export default function LandingFooter({ anchorPrefix = "" }: { anchorPrefix?: string }) {
  const getHref = (href: string) => (href.startsWith("#") ? `${anchorPrefix}${href}` : href);
  const muted = "text-slate-deep-soft";
  const linkClass = "text-sm text-white/85 hover:text-brand";

  return (
    <footer className="bg-slate-deep py-16 text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Capture e-mail — elle mène à la création de compte, pas à une
            newsletter : aucune liste de diffusion n'existe côté produit, et
            promettre un abonnement qui n'arriverait jamais serait un mensonge. */}
        {/* Capture e-mail */}
          <div className="mb-14 grid grid-cols-1 gap-8 rounded-2xl border border-slate-deep-line bg-[#0E2618] p-8 lg:grid-cols-12 lg:items-center sm:p-10">
            <div className="lg:col-span-6">
              <h2 className="font-display text-2xl font-bold leading-snug text-white sm:text-3xl">
                Le réseau commence ici.
              </h2>
              <p className="mt-2 text-sm text-slate-deep-soft">
                Créez votre compte en deux minutes et connectez votre premier routeur aujourd&apos;hui.
              </p>
            </div>
            <form
              action="/auth/register"
              method="get"
              className="flex w-full flex-col gap-2 sm:flex-row lg:col-span-6"
            >
              <label htmlFor="footer-email" className="sr-only">
                Adresse e-mail
              </label>
              <input
                id="footer-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="vous@votre-reseau.ci"
                className="min-w-0 flex-1 rounded-full border border-slate-deep-line bg-slate-deep px-5 py-3 text-sm text-white placeholder:text-slate-deep-soft focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button type="submit" className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary px-6 py-3 text-sm">
                Créer un compte
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </form>
          </div>

        {/* Grille asymétrique : marque large + colonnes serrées */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Logo dark />
            <p className={`mt-4 max-w-xs text-sm leading-6 ${muted}`}>
              Plateforme d&apos;automatisation Hotspot et FAI. Abidjan, Côte d&apos;Ivoire.
            </p>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title} className="lg:col-span-2">
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${muted}`}>
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5" role="list">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("/auth") ? (
                      <Link href={l.href} className={linkClass}>
                        {l.label}
                      </Link>
                    ) : (
                      <a href={getHref(l.href)} className={linkClass}>
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-slate-deep-line pt-6 sm:flex-row sm:items-center">
          <p className={`text-xs ${muted}`}>
            © {new Date().getFullYear()} SafeLinkHub. Tous droits réservés.
          </p>
          <nav aria-label="Réseaux sociaux" className="flex gap-5">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-deep-soft hover:text-brand"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
