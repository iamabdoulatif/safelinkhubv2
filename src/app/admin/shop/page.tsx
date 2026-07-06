// Boutique — catalogue accessible à tous les admins connectés. Le superadmin
// y voit en plus un accès à la gestion (CRUD).

import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { listActiveProducts, listCategories } from "@/lib/shop/service";
import { getManualPaymentContact } from "@/lib/billing/manual-payment";
import ShopExperience from "./ShopExperience";

export default async function ShopPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const [products, categories, contact] = await Promise.all([
    listActiveProducts(),
    listCategories(),
    Promise.resolve(getManualPaymentContact()),
  ]);
  const superadmin = isSuperAdmin(session.role);

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Boutique</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Équipement technologique — commandez directement via WhatsApp.
          </p>
        </div>
        {superadmin && (
          <Link
            href="/admin/shop/manage"
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F]"
          >
            <Settings className="h-4 w-4" />
            Gérer la boutique
          </Link>
        )}
      </div>

      <ShopExperience
        products={products}
        categories={categories.map((c) => c.name)}
        whatsappNumber={contact.whatsappNumber}
        buyerName={session.name}
        buyerEmail={session.email}
      />
    </div>
  );
}
