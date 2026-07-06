"use client";

// Expérience boutique : filtre par catégorie, cartes produit avec choix de
// couleur et ajout au panier, panier (tiroir) et commande via WhatsApp.

import { useMemo, useState } from "react";
import {
  ShoppingBag,
  ShoppingCart,
  ExternalLink,
  PackageX,
  Plus,
  Minus,
  Trash2,
  X,
  Check,
} from "lucide-react";
import type { ProductRow } from "@/lib/shop/service";
import { CartProvider, useCart } from "@/lib/shop/cart";
import {
  buildCartOrderMessage,
  buildWhatsappLink,
  colorHex,
  formatFcfa,
} from "@/lib/shop/shop-config";

export default function ShopExperience(props: {
  products: ProductRow[];
  categories?: string[];
  whatsappNumber: string;
  buyerName: string;
  buyerEmail: string;
}) {
  return (
    <CartProvider>
      <ShopInner {...props} />
    </CartProvider>
  );
}

function ShopInner({
  products,
  categories: definedCategories = [],
  whatsappNumber,
  buyerName,
  buyerEmail,
}: {
  products: ProductRow[];
  categories?: string[];
  whatsappNumber: string;
  buyerName: string;
  buyerEmail: string;
}) {
  const cart = useCart();
  const [category, setCategory] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sidebar = catégories définies (superadmin), suivies de toute catégorie
  // présente sur un produit mais non listée (données héritées), pour ne jamais
  // rendre un produit inaccessible au filtre.
  const categories = useMemo(() => {
    const ordered = [...definedCategories];
    const seen = new Set(ordered);
    products.forEach((p) => {
      if (p.category && !seen.has(p.category)) {
        seen.add(p.category);
        ordered.push(p.category);
      }
    });
    return ordered;
  }, [definedCategories, products]);

  const countFor = (c: string) => products.filter((p) => p.category === c).length;
  const filtered = category ? products.filter((p) => p.category === category) : products;

  return (
    <div className="mt-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
      {/* Sidebar catégories */}
      {categories.length > 0 && (
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-ink-soft lg:block">
            Catégories
          </h2>
          {/* Desktop : liste verticale ; mobile : chips scrollables */}
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
            <SidebarItem
              active={category === null}
              onClick={() => setCategory(null)}
              label="Tout"
              count={products.length}
            />
            {categories.map((c) => (
              <SidebarItem
                key={c}
                active={category === c}
                onClick={() => setCategory(c)}
                label={c}
                count={countFor(c)}
              />
            ))}
          </nav>
        </aside>
      )}

      {/* Catalogue */}
      <div className={categories.length > 0 ? "mt-6 lg:mt-0" : ""}>
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-line-soft bg-paper p-10 text-center text-sm text-ink-soft">
            Aucun produit dans cette catégorie.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={cart.add} />
            ))}
          </div>
        )}
      </div>

      {/* Bouton panier flottant */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-brand-deep px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
      >
        <ShoppingCart className="h-5 w-5" />
        Panier
        {cart.count > 0 && (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-brand-deep">
            {cart.count}
          </span>
        )}
      </button>

      <CartDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        whatsappNumber={whatsappNumber}
        buyerName={buyerName}
        buyerEmail={buyerEmail}
      />
    </div>
  );
}

function SidebarItem({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition lg:w-full lg:rounded-lg lg:border-transparent lg:px-3 lg:py-2 lg:text-left ${
        active
          ? "border-brand-deep bg-brand-deep text-white lg:border-transparent lg:bg-brand/10 lg:text-brand-deep"
          : "border-line-soft bg-paper text-ink-soft hover:border-brand-deep hover:text-ink lg:bg-transparent lg:hover:bg-clay/60"
      }`}
    >
      <span className="truncate">{label}</span>
      <span
        className={`shrink-0 text-xs tabular-nums ${
          active ? "text-white/80 lg:text-brand-deep/70" : "text-ink-soft/70"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ProductCard({
  product,
  onAdd,
}: {
  product: ProductRow;
  onAdd: ReturnType<typeof useCart>["add"];
}) {
  const colors = product.colors ?? [];
  const [selectedColor, setSelectedColor] = useState<string | null>(colors[0] ?? null);
  const [justAdded, setJustAdded] = useState(false);
  const outOfStock = product.stockQuantity <= 0;

  function add() {
    onAdd({
      productId: product.id,
      name: product.name,
      priceFcfa: product.priceFcfa,
      color: selectedColor,
      imageUrl: product.imageUrl,
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1400);
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-line-soft bg-paper shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-clay/40">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <ShoppingBag className="h-10 w-10 text-ink-soft/30" />
        )}
        {product.category && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-paper/90 px-2.5 py-0.5 text-[11px] font-medium text-ink-soft backdrop-blur">
            {product.category}
          </span>
        )}
        {outOfStock && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
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
          <div className="mt-3 flex items-center gap-1.5">
            {colors.map((c) => {
              const active = c === selectedColor;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  title={c}
                  aria-label={`Couleur ${c}`}
                  className={`h-6 w-6 rounded-full border-2 transition ${
                    active ? "border-brand-deep ring-2 ring-brand/40" : "border-line-soft"
                  }`}
                  style={{ backgroundColor: colorHex(c) }}
                />
              );
            })}
            {selectedColor && <span className="ml-1 text-xs text-ink-soft">{selectedColor}</span>}
          </div>
        )}

        <div className="mt-auto pt-3">
          <p className="mb-2 text-xs text-ink-soft">
            {outOfStock ? "Indisponible" : `${product.stockQuantity} en stock`}
          </p>
          <button
            onClick={add}
            disabled={outOfStock}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              outOfStock
                ? "cursor-not-allowed bg-clay text-ink-soft"
                : justAdded
                  ? "bg-green-600 text-white"
                  : "bg-ink text-white hover:bg-[#3A362F]"
            }`}
          >
            {justAdded ? (
              <>
                <Check className="h-4 w-4" /> Ajouté
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Ajouter au panier
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartDrawer({
  open,
  onClose,
  whatsappNumber,
  buyerName,
  buyerEmail,
}: {
  open: boolean;
  onClose: () => void;
  whatsappNumber: string;
  buyerName: string;
  buyerEmail: string;
}) {
  const cart = useCart();

  const orderUrl = buildWhatsappLink(
    whatsappNumber,
    buildCartOrderMessage({
      items: cart.items,
      totalFcfa: cart.total,
      buyerName,
      buyerEmail,
    }),
  );

  return (
    <div
      className={`fixed inset-0 z-50 transition ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Panier"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line-soft p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <ShoppingCart className="h-5 w-5" /> Votre panier
          </h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-ink-soft">
            <ShoppingCart className="h-10 w-10 text-ink-soft/30" />
            Votre panier est vide.
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {cart.items.map((i) => (
                <div
                  key={`${i.productId}::${i.color ?? ""}`}
                  className="flex gap-3 rounded-lg border border-line-soft p-2.5"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-clay/40">
                    {i.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.imageUrl} alt={i.name} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag className="h-5 w-5 text-ink-soft/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{i.name}</p>
                    <p className="text-xs text-ink-soft">
                      {i.color ? `${i.color} · ` : ""}
                      {formatFcfa(i.priceFcfa)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="inline-flex items-center rounded-md border border-line-soft">
                        <button
                          onClick={() => cart.setQuantity(i.productId, i.color, i.quantity - 1)}
                          className="p-1 text-ink-soft hover:bg-clay"
                          aria-label="Diminuer"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-6 text-center text-xs font-medium text-ink">
                          {i.quantity}
                        </span>
                        <button
                          onClick={() => cart.setQuantity(i.productId, i.color, i.quantity + 1)}
                          className="p-1 text-ink-soft hover:bg-clay"
                          aria-label="Augmenter"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => cart.remove(i.productId, i.color)}
                        className="text-ink-soft hover:text-red-600"
                        aria-label="Retirer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-ink">
                    {formatFcfa(i.priceFcfa * i.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-line-soft p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">Total</span>
                <span className="text-lg font-bold text-ink">{formatFcfa(cart.total)}</span>
              </div>
              <a
                href={orderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-deep px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Commander via WhatsApp <ExternalLink className="h-4 w-4" />
              </a>
              <button
                onClick={cart.clear}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
              >
                <Trash2 className="h-4 w-4" /> Vider le panier
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
