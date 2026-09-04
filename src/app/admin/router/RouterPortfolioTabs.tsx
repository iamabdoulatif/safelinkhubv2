import Link from "next/link";
import type { RouterPortfolioScope } from "./router-portfolio";
import type { RouterDictionary } from "./RoutersTable";

type RouterPortfolioTabsProps = {
  activeScope: RouterPortfolioScope;
  t: RouterDictionary["tabs"];
};

const scopes: Array<{ scope: RouterPortfolioScope; href: string; label: keyof RouterDictionary["tabs"] }> = [
  { scope: "mine", href: "/admin/router?scope=mine", label: "mine" },
  { scope: "clients", href: "/admin/router?scope=clients", label: "clients" },
];

export function RouterPortfolioTabs({ activeScope, t }: RouterPortfolioTabsProps) {
  return (
    <nav aria-label={t.label} className="flex flex-wrap gap-2">
      {scopes.map(({ scope, href, label }) => {
        const isActive = scope === activeScope;

        return (
          <Link
            key={scope}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              isActive
                ? "border-ink bg-ink text-paper"
                : "border-line bg-paper text-ink-soft hover:bg-clay hover:text-ink"
            }`}
          >
            {t[label]}
          </Link>
        );
      })}
    </nav>
  );
}
