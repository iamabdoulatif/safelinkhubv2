import Link from "next/link";
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
  const getHref = (href: string) =>
    href.startsWith("#") ? `${anchorPrefix}${href}` : href;

  return (
    <footer className="bg-ink py-14 text-paper">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Grille asymétrique : marque large + colonnes serrées */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Logo dark />
            <p className="mt-4 max-w-xs font-display text-2xl font-bold leading-snug">
              Le réseau commence ici.
            </p>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title} className="lg:col-span-2">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-[#A8A29E]">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5" role="list">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("/auth") ? (
                      <Link href={l.href} className="text-sm text-paper hover:bg-brand hover:text-[#1C1917]">
                        {l.label}
                      </Link>
                    ) : (
                      <a href={getHref(l.href)} className="text-sm text-paper hover:bg-brand hover:text-[#1C1917]">
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t-2 border-[#3A362F] pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-xs text-[#A8A29E]">
            © {new Date().getFullYear()} SafeLinkHub. Tous droits réservés.
          </p>
          <nav aria-label="Réseaux sociaux" className="flex gap-5">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-[#A8A29E] hover:bg-brand hover:text-[#1C1917]"
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
