"use client";

// Grille de produits du catalogue. Choix de couleur puis commande via un lien
// WhatsApp pré-rempli (pas de paiement intégré pour l'instant).

import { useState } from "react";
import { ShoppingBag, ExternalLink, PackageX } from "lucide-react";
import type { ProductRow } from "@/lib/shop/service";
import {
  buildProductOrderMessage,
  buildWhatsappLink,
  colorHex,
  formatFcfa,
} from "@/lib/shop/shop-config";

export default function ShopCatalog({
  products,
  whatsappNumber,
  buyerName,
  buyerEmail,
}: {
  products: ProductRow[];
  whatsappNumber: string;
  buyerName: string;
  buyerEmail: string;
}) {
  if (products.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-line-soft bg-paper p-8 text-center text-sm text-ink-soft">
        Aucun produit disponible pour le moment.
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          whatsappNumber={whatsappNumber}
          buyerName={buyerName}
          buyerEmail={buyerEmail}
        />
      ))}
    </div>
  );
}

function ProductCard({
  product,
  whatsappNumber,
  buyerName,
  buyerEmail,
}: {
  product: ProductRow;
  whatsappNumber: string;
  buyerName: string;
  buyerEmail: string;
}) {
  const colors = product.colors ?? [];
  const [selectedColor, setSelectedColor] = useState<string | null>(colors[0] ?? null);
  const outOfStock = product.stockQuantity <= 0;

  const orderUrl = buildWhatsappLink(
    whatsappNumber,
    buildProductOrderMessage({
      productName: product.name,
      priceFcfa: product.priceFcfa,
      color: selectedColor,
      buyerName,
      buyerEmail,
    }),
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line-soft bg-paper shadow-sm">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-clay/50">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <ShoppingBag className="h-10 w-10 text-ink-soft/40" />
        )}
        {product.category && (
          <span className="absolute left-2 top-2 rounded-full bg-paper/90 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            {product.category}
          </span>
        )}
        {outOfStock && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
            <PackageX className="h-3 w-3" /> Rupture
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-ink">{product.name}</h3>
            {product.brand && <p className="text-xs text-ink-soft">{product.brand}</p>}
          </div>
          <p className="shrink-0 font-bold text-ink">{formatFcfa(product.priceFcfa)}</p>
        </div>

        {product.description && (
          <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{product.description}</p>
        )}

        {colors.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">Couleur</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {colors.map((c) => {
                const active = c === selectedColor;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    title={c}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      active ? "border-brand-deep ring-2 ring-brand/40" : "border-line-soft"
                    }`}
                    style={{ backgroundColor: colorHex(c) }}
                    aria-label={`Couleur ${c}${active ? " (sélectionnée)" : ""}`}
                  />
                );
              })}
            </div>
            {selectedColor && <p className="mt-1 text-xs text-ink-soft">{selectedColor}</p>}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-ink-soft">
            {outOfStock ? "Indisponible" : `${product.stockQuantity} en stock`}
          </span>
        </div>

        <a
          href={outOfStock ? undefined : orderUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={outOfStock}
          className={`mt-3 inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium ${
            outOfStock
              ? "cursor-not-allowed bg-clay text-ink-soft"
              : "bg-brand-deep text-white hover:opacity-90"
          }`}
        >
          Commander via WhatsApp <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
