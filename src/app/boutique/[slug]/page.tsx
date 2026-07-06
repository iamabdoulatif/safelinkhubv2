// Fiche produit publique — /boutique/<slug>. Galerie, caractéristiques,
// produits similaires, récemment consultés, ajout panier + commande WhatsApp.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { getSession } from "@/lib/auth/session";
import {
  getActiveProductBySlug,
  listSimilarProducts,
  listActiveProductsMini,
} from "@/lib/shop/service";
import { getManualPaymentContact } from "@/lib/billing/manual-payment";
import ProductDetail from "./ProductDetail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getActiveProductBySlug(slug);
  if (!product) return { title: "Produit introuvable | SafeLinkHub" };
  return {
    title: `${product.name} | Boutique SafeLinkHub`,
    description: product.description ?? undefined,
    openGraph: product.imageUrl ? { images: [product.imageUrl] } : undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getActiveProductBySlug(slug);
  if (!product) notFound();

  const [session, similar, catalogue] = await Promise.all([
    getSession(),
    listSimilarProducts(product),
    listActiveProductsMini(),
  ]);
  const contact = getManualPaymentContact();

  return (
    <div className="flex flex-1 flex-col">
      <LandingNav anchorPrefix="/" />
      <main className="flex-1 bg-paper">
        <ProductDetail
          product={product}
          similar={similar}
          catalogue={catalogue}
          whatsappNumber={contact.whatsappNumber}
          buyerName={session?.name ?? ""}
          buyerEmail={session?.email ?? ""}
        />
      </main>
      <LandingFooter anchorPrefix="/" />
    </div>
  );
}
