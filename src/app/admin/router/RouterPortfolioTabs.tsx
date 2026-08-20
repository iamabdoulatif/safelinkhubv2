import Link from "next/link";
import type { RouterPortfolioScope } from "./router-portfolio";

type RouterPortfolioTabsProps = {
  activeScope: RouterPortfolioScope;
};

const scopes: Array<{ scope: RouterPortfolioScope; href: string; label: string }> = [
  { scope: "mine", href: "/admin/router?scope=mine", label: "Mon parc" },
  { scope: "clients", href: "/admin/router?scope=clients", label: "Parcs clients" },
];

export function RouterPortfolioTabs({ activeScope }: RouterPortfolioTabsProps) {
  return (
    <nav aria-label="Portefeuille de routeurs" className="flex flex-wrap gap-2">
      {scopes.map(({ scope, href, label }) => {
        const isActive = scope === activeScope;

        return (
          <Link
            key={scope}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex border border-line px-4 py-2 text-sm font-bold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              isActive
                ? "bg-brand text-slate-deep"
                : "bg-paper text-ink hover:bg-clay"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
