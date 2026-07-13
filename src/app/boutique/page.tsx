// Boutique — extraite dans un projet à part (aura son propre landing + ses
// propres menus). Ici, page AUTONOME volontairement SANS la nav/footer du site
// principal : juste un placeholder "en cours de conception".

import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";

export const metadata: Metadata = {
  title: "Boutique | SafeLinkHub",
  description: "La boutique d'équipement SafeLinkHub arrive bientôt.",
};

export default function BoutiquePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
      <div className="mx-auto max-w-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-clay">
          <ShoppingBag className="h-8 w-8 text-ink" />
        </div>
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          Boutique en cours de conception
        </h1>
        <p className="mt-3 text-base text-ink-soft">
          Notre boutique d&apos;équipement (routeurs MikroTik, antennes, switchs PoE et
          accessoires) arrive très bientôt, avec son propre espace dédié. Revenez la
          découvrir prochainement.
        </p>
        <p className="mt-8 text-xs font-medium uppercase tracking-wide text-ink-soft/70">
          SafeLinkHub · Boutique
        </p>
      </div>
    </main>
  );
}
