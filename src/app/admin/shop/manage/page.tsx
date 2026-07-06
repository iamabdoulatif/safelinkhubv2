// Gestion de la boutique — réservée au superadmin (CRUD produits).

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { listAllProducts, listCategories } from "@/lib/shop/service";
import ProductManager from "./ProductManager";

export default async function ShopManagePage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const [products, categories] = await Promise.all([listAllProducts(), listCategories()]);

  return (
    <div className="animate-fade-in-up">
      <Link
        href="/admin/shop"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Retour au catalogue
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-ink">Gestion de la boutique</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Ajoutez, modifiez ou masquez les produits de la boutique.
      </p>

      <ProductManager products={products} categories={categories} />
    </div>
  );
}
