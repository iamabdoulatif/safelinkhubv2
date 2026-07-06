"use client";

// Expérience boutique (mobile-first) : recherche en tête, catégories en
// carrousel, grille compacte de cartes image-forward, quick-view au tap,
// panier flottant compact + tiroir, commande via WhatsApp.
//
// Design 100 % tokens (paper/ink/brand/line…) → compatible mode sombre.
// Aucune ombre diffuse hors carte, cibles tactiles ≥ 44px, images lazy +
// skeleton, animations sur transform/opacity (GPU).

import { useMemo, useRef, useState } from "react";
import {
  ShoppingBag,
  ShoppingCart,
  ExternalLink,
  Plus,
  Minus,
  Trash2,
  X,
  Check,
  Search,
  Sparkles,
} from "lucide-react";
import type { ProductRow } from "@/lib/shop/service";
import { CartProvider, useCart } from "@/lib/shop/cart";
import { availabilityOf, isNewProduct, type AvailabilityTone } from "@/lib/shop/product-status";
import {
  buildCartOrderMessage,
  buildProductOrderMessage,
  buildWhatsappLink,
  colorHex,
  formatFcfa,
} from "@/lib/shop/shop-config";

type Buyer = { whatsappNumber: string; buyerName: string; buyerEmail: string };

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
  const buyer: Buyer = { whatsappNumber, buyerName, buyerEmail };
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickView, setQuickView] = useState<ProductRow | null>(null);

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

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return [p.name, p.brand, p.description, p.category]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q));
    });
  }, [products, category, q]);

  const openCart = () => setDrawerOpen(true);

  return (
    <div className="mt-5">
      {/* Recherche — pleine largeur, prioritaire, visible dès l'arrivée */}
      <div className="rounded-2xl border-2 border-line-soft bg-paper p-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 h-5 w-5 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un routeur, une marque…"
            aria-label="Rechercher dans la boutique"
            enterKeyHint="search"
            className="h-11 w-full rounded-xl bg-clay/60 pl-11 pr-10 text-[15px] text-ink placeholder:text-ink-soft focus:bg-paper focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Carrousel de catégories */}
      {categories.length > 0 && (
        <div className="mt-4 -mx-4 px-4 sm:mx-0 sm:px-0">
          <nav
            aria-label="Catégories"
            className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <CategoryChip
              active={category === null}
              onClick={() => setCategory(null)}
              label="Tout"
              count={products.length}
            />
            {categories.map((c) => (
              <CategoryChip
                key={c}
                active={category === c}
                onClick={() => setCategory(c)}
                label={c}
                count={countFor(c)}
              />
            ))}
          </nav>
        </div>
      )}

      {/* Grille produits */}
      {filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border-2 border-line bg-paper p-10 text-center text-sm text-ink-soft">
          {q
            ? `Aucun produit ne correspond à « ${query.trim()} ».`
            : "Aucun produit dans cette catégorie."}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onAdd={cart.add}
              onOpen={() => setQuickView(p)}
              onViewCart={openCart}
            />
          ))}
        </div>
      )}

      {/* Panier flottant compact */}
      <FloatingCart count={cart.count} onClick={openCart} />

      {quickView && (
        <QuickView
          product={quickView}
          buyer={buyer}
          onClose={() => setQuickView(null)}
          onViewCart={() => {
            setQuickView(null);
            openCart();
          }}
          onAdd={cart.add}
        />
      )}

      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} buyer={buyer} />
    </div>
  );
}

/* ── Catégories ─────────────────────────────────────────────────────────── */

function CategoryChip({
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
      aria-pressed={active}
      className={`flex h-10 shrink-0 snap-start items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold transition-colors ${
        active
          ? "border-brand bg-brand text-[#1C1917]"
          : "border-line-soft bg-paper text-ink-soft hover:border-ink hover:text-ink"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span className={`text-xs tabular-nums ${active ? "text-[#1C1917]/60" : "text-ink-soft/60"}`}>
        {count}
      </span>
    </button>
  );
}

/* ── Image avec skeleton ────────────────────────────────────────────────── */

function ProductImage({
  src,
  alt,
  eager,
}: {
  src: string | null;
  alt: string;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-clay/60">
        <ShoppingBag className="h-8 w-8 text-ink-soft/25" />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      {!loaded && <div className="absolute inset-0 animate-pulse bg-clay" aria-hidden />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/* ── Badges & disponibilité ─────────────────────────────────────────────── */

const TONE_STYLES: Record<AvailabilityTone, string> = {
  ok: "text-ok",
  low: "text-warn",
  out: "text-err",
};
const TONE_DOT: Record<AvailabilityTone, string> = {
  ok: "bg-ok",
  low: "bg-warn",
  out: "bg-err",
};

function AvailabilityPill({ stock }: { stock: number }) {
  const a = availabilityOf(stock);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${TONE_STYLES[a.tone]}`}>
      <span className={`h-2 w-2 rounded-full ${TONE_DOT[a.tone]}`} aria-hidden />
      {a.label}
    </span>
  );
}

/* ── Carte produit ──────────────────────────────────────────────────────── */

function ProductCard({
  product,
  onAdd,
  onOpen,
  onViewCart,
}: {
  product: ProductRow;
  onAdd: ReturnType<typeof useCart>["add"];
  onOpen: () => void;
  onViewCart: () => void;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const outOfStock = product.stockQuantity <= 0;
  const isNew = isNewProduct(product.createdAt);
  const defaultColor = product.colors?.[0] ?? null;

  function add(e: React.MouseEvent) {
    e.stopPropagation();
    if (outOfStock) return;
    onAdd({
      productId: product.id,
      name: product.name,
      priceFcfa: product.priceFcfa,
      color: defaultColor,
      imageUrl: product.imageUrl,
    });
    setJustAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setJustAdded(false), 2200);
  }

  return (
    <article
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Voir ${product.name}`}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 border-line-soft bg-paper transition-[transform,border-color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99] hover:border-ink motion-reduce:transition-none"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-clay/40">
        <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none">
          <ProductImage src={product.imageUrl} alt={product.name} />
        </div>

        {/* Badges superposés */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1">
          {isNew && !outOfStock ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1C1917]">
              <Sparkles className="h-3 w-3" /> Nouveau
            </span>
          ) : (
            <span />
          )}
          {outOfStock && (
            <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-paper">
              Rupture
            </span>
          )}
        </div>
      </div>

      {/* Contenu — hiérarchie : marque › nom › prix › dispo › desc › CTA */}
      <div className="flex flex-1 flex-col p-3">
        {product.brand && (
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            {product.brand}
          </p>
        )}
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {product.name}
        </h3>

        <p className="mt-1.5 text-lg font-extrabold text-brand-deep">
          {formatFcfa(product.priceFcfa)}
        </p>

        <div className="mt-1">
          <AvailabilityPill stock={product.stockQuantity} />
        </div>

        {product.description && (
          <p className="mt-1.5 line-clamp-1 text-xs text-ink-soft">{product.description}</p>
        )}

        {/* CTA — indépendant de la navigation carte */}
        <div className="mt-auto pt-3">
          <button
            onClick={add}
            disabled={outOfStock}
            aria-label={`Ajouter ${product.name} au panier`}
            className={`flex h-11 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${
              outOfStock
                ? "cursor-not-allowed bg-clay text-ink-soft"
                : justAdded
                  ? "bg-ok text-white"
                  : "bg-ink text-paper hover:bg-[#3A362F] active:scale-[0.98]"
            }`}
          >
            {justAdded ? (
              <>
                <Check className="h-4 w-4" /> Ajouté
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span className="truncate">Ajouter</span>
              </>
            )}
          </button>
          {justAdded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewCart();
              }}
              className="mt-1.5 flex w-full items-center justify-center text-xs font-semibold text-brand-deep hover:underline"
            >
              Voir le panier →
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ── Quick-view (fiche rapide) ──────────────────────────────────────────── */

function QuickView({
  product,
  buyer,
  onClose,
  onViewCart,
  onAdd,
}: {
  product: ProductRow;
  buyer: Buyer;
  onClose: () => void;
  onViewCart: () => void;
  onAdd: ReturnType<typeof useCart>["add"];
}) {
  const colors = product.colors ?? [];
  const [selectedColor, setSelectedColor] = useState<string | null>(colors[0] ?? null);
  const [added, setAdded] = useState(false);
  const outOfStock = product.stockQuantity <= 0;

  const orderUrl = buildWhatsappLink(
    buyer.whatsappNumber,
    buildProductOrderMessage({
      productName: product.name,
      priceFcfa: product.priceFcfa,
      color: selectedColor,
      buyerName: buyer.buyerName || undefined,
      buyerEmail: buyer.buyerEmail || undefined,
    }),
  );

  function add() {
    onAdd({
      productId: product.id,
      name: product.name,
      priceFcfa: product.priceFcfa,
      color: selectedColor,
      imageUrl: product.imageUrl,
    });
    setAdded(true);
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={product.name}>
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-3xl border-t-2 border-line bg-paper animate-fade-slide-up sm:inset-0 sm:m-auto sm:h-fit sm:max-w-lg sm:rounded-3xl sm:border-2">
        <div className="sticky top-0 flex items-center justify-between border-b-2 border-line bg-paper px-4 py-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-line-soft sm:hidden" aria-hidden />
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <div className="aspect-square overflow-hidden rounded-2xl border-2 border-line-soft bg-clay/40">
            <ProductImage src={product.imageUrl} alt={product.name} eager />
          </div>

          <div className="mt-4">
            {product.brand && (
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {product.brand}
              </p>
            )}
            <h2 className="mt-0.5 font-display text-xl font-bold text-ink">{product.name}</h2>
            <p className="mt-2 text-2xl font-extrabold text-brand-deep">
              {formatFcfa(product.priceFcfa)}
            </p>
            <div className="mt-2">
              <AvailabilityPill stock={product.stockQuantity} />
            </div>

            {product.description && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                {product.description}
              </p>
            )}

            {colors.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold text-ink-soft">Couleur</p>
                <div className="flex flex-wrap items-center gap-2">
                  {colors.map((c) => {
                    const active = c === selectedColor;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelectedColor(c)}
                        title={c}
                        aria-label={`Couleur ${c}`}
                        aria-pressed={active}
                        className={`h-9 w-9 rounded-full border-2 transition ${
                          active ? "border-brand-deep ring-2 ring-brand/40" : "border-line-soft"
                        }`}
                        style={{ backgroundColor: colorHex(c) }}
                      />
                    );
                  })}
                  {selectedColor && (
                    <span className="text-xs text-ink-soft">{selectedColor}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions collantes */}
        <div
          className="sticky bottom-0 space-y-2 border-t-2 border-line bg-paper p-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {added ? (
            <button
              onClick={onViewCart}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ok text-sm font-bold text-white"
            >
              <Check className="h-5 w-5" /> Ajouté — Voir le panier
            </button>
          ) : (
            <button
              onClick={add}
              disabled={outOfStock}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${
                outOfStock
                  ? "cursor-not-allowed bg-clay text-ink-soft"
                  : "bg-ink text-paper hover:bg-[#3A362F] active:scale-[0.99]"
              }`}
            >
              <Plus className="h-5 w-5" /> Ajouter au panier
            </button>
          )}
          <a
            href={orderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-line bg-paper text-sm font-bold text-ink hover:bg-clay"
          >
            Commander via WhatsApp <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Panier flottant compact ────────────────────────────────────────────── */

function FloatingCart({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Ouvrir le panier${count > 0 ? ` (${count} article${count > 1 ? "s" : ""})` : ""}`}
      className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-line bg-ink text-paper shadow-[4px_4px_0_var(--color-line)] transition-transform hover:-translate-y-0.5 active:scale-95 motion-reduce:transition-none"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <ShoppingCart className="h-6 w-6" />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-paper bg-brand px-1 text-xs font-bold tabular-nums text-[#1C1917]">
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Tiroir panier ──────────────────────────────────────────────────────── */

function CartDrawer({
  open,
  onClose,
  buyer,
}: {
  open: boolean;
  onClose: () => void;
  buyer: Buyer;
}) {
  const cart = useCart();

  const orderUrl = buildWhatsappLink(
    buyer.whatsappNumber,
    buildCartOrderMessage({
      items: cart.items,
      totalFcfa: cart.total,
      buyerName: buyer.buyerName || undefined,
      buyerEmail: buyer.buyerEmail || undefined,
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
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l-2 border-line bg-paper transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b-2 border-line p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <ShoppingCart className="h-5 w-5" /> Votre panier
          </h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
            aria-label="Fermer"
          >
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
                  className="flex gap-3 rounded-xl border-2 border-line-soft p-2.5"
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-clay/40">
                    {i.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={i.imageUrl}
                        alt={i.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ShoppingBag className="h-5 w-5 text-ink-soft/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{i.name}</p>
                    <p className="text-xs text-ink-soft">
                      {i.color ? `${i.color} · ` : ""}
                      {formatFcfa(i.priceFcfa)}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="inline-flex items-center rounded-lg border-2 border-line-soft">
                        <button
                          onClick={() => cart.setQuantity(i.productId, i.color, i.quantity - 1)}
                          className="flex h-8 w-8 items-center justify-center text-ink-soft hover:bg-clay"
                          aria-label="Diminuer la quantité"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-8 text-center text-sm font-semibold text-ink">
                          {i.quantity}
                        </span>
                        <button
                          onClick={() => cart.setQuantity(i.productId, i.color, i.quantity + 1)}
                          className="flex h-8 w-8 items-center justify-center text-ink-soft hover:bg-clay"
                          aria-label="Augmenter la quantité"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <button
                        onClick={() => cart.remove(i.productId, i.color)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-clay hover:text-err"
                        aria-label="Retirer l'article"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-ink">
                    {formatFcfa(i.priceFcfa * i.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="border-t-2 border-line p-4"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">Total</span>
                <span className="text-xl font-extrabold text-ink">{formatFcfa(cart.total)}</span>
              </div>
              <a
                href={orderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-[#1C1917] hover:bg-brand-deep hover:text-white"
              >
                Commander via WhatsApp <ExternalLink className="h-4 w-4" />
              </a>
              <button
                onClick={cart.clear}
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 text-sm font-medium text-ink-soft hover:text-err"
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
