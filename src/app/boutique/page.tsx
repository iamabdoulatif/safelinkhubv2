// Boutique publique — visible depuis la navigation du site, sans connexion.
// Le catalogue est en lecture pour tous ; la commande se fait via WhatsApp.

import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { listActiveProducts, listCategories } from "@/lib/shop/service";
import { getManualPaymentContact } from "@/lib/billing/manual-payment";
import ShopExperience from "@/app/admin/shop/ShopExperience";

export const metadata: Metadata = {
  title: "Boutique | SafeLinkHub",
  description:
    "Équipement technologique pour opérateurs de hotspot : routeurs MikroTik, antennes, switchs PoE et accessoires. Commande via WhatsApp.",
};

export default async function BoutiquePage() {
  const [session, products, categories] = await Promise.all([
    getSession(),
    listActiveProducts(),
    listCategories(),
  ]);
  const contact = getManualPaymentContact();
  const superadmin = isSuperAdmin(session?.role);

  return (
    <div className="flex flex-1 flex-col">
      <LandingNav anchorPrefix="/" />
      <main className="flex-1 bg-paper">
        <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">Boutique</h1>
              <p className="mt-1 text-sm text-ink-soft sm:text-base">
                Routeurs, antennes, switchs et accessoires professionnels.
              </p>
            </div>
            {superadmin && (
              <Link
                href="/admin/shop/manage"
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-[#3A362F]"
              >
                <Settings className="h-4 w-4" />
                Gérer
              </Link>
            )}
          </div>

          <ShopExperience
            products={products}
            categories={categories.map((c) => c.name)}
            whatsappNumber={contact.whatsappNumber}
            buyerName={session?.name ?? ""}
            buyerEmail={session?.email ?? ""}
          />
        </section>
      </main>
      <LandingFooter anchorPrefix="/" />
    </div>
  );
}
