"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Plus, Check, ExternalLink, ChevronLeft, ZoomIn, X } from "lucide-react";
import type { ProductRow, ProductMini } from "@/lib/shop/service";
import { CartProvider, useCart } from "@/lib/shop/cart";
import { availabilityOf, isNewProduct, type AvailabilityTone } from "@/lib/shop/product-status";
import {
  badgeMeta,
  buildProductOrderMessage,
  buildWhatsappLink,
  colorHex,
  formatFcfa,
} from "@/lib/shop/shop-config";
import { FloatingCart, CartDrawer, type Buyer } from "@/components/shop/cart-ui";

const RECENT_KEY = "slh_recent_v1";

type Props = {
  product: ProductRow;
  similar: ProductRow[];
  catalogue: ProductMini[];
  whatsappNumber: string;
  buyerName: string;
  buyerEmail: string;
};

export default function ProductDetail(props: Props) {
  return (
    <CartProvider>
      <Detail {...props} />
    </CartProvider>
  );
}

const TONE_TEXT: Record<AvailabilityTone, string> = { ok: "text-ok", low: "text-warn", out: "text-err" };
const TONE_DOT: Record<AvailabilityTone, string> = { ok: "bg-ok", low: "bg-warn", out: "bg-err" };
const BADGE_TONE_CLS: Record<string, string> = {
  err: "bg-err text-white",
  brand: "bg-brand text-[#1C1917]",
  ok: "bg-ok text-white",
  ink: "bg-ink text-paper",
};

function Detail({ product, similar, catalogue, whatsappNumber, buyerName, buyerEmail }: Props) {
  const cart = useCart();
  const buyer: Buyer = { whatsappNumber, buyerName, buyerEmail };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const colors = product.colors ?? [];
  const [selectedColor, setSelectedColor] = useState<string | null>(colors[0] ?? null);
  const outOfStock = product.stockQuantity <= 0;
  const avail = availabilityOf(product.stockQuantity);

  const gallery = useMemo(
    () => [product.imageUrl, ...(product.images ?? [])].filter((u): u is string => Boolean(u)),
    [product.imageUrl, product.images],
  );

  // Récemment consultés : lit l'historique AVANT d'y insérer le produit courant.
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  useEffect(() => {
    let prev: string[] = [];
    try {
      prev = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {
      /* ignore */
    }
    setRecentSlugs(prev.filter((s) => s !== product.slug));
    if (product.slug) {
      const next = [product.slug, ...prev.filter((s) => s !== product.slug)].slice(0, 12);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  }, [product.slug]);

  const bySlug = useMemo(() => new Map(catalogue.map((p) => [p.slug, p])), [catalogue]);
  const recentlyViewed = recentSlugs
    .map((s) => bySlug.get(s))
    .filter((p): p is ProductMini => Boolean(p) && p!.id !== product.id)
    .slice(0, 6);

  const orderUrl = buildWhatsappLink(
    whatsappNumber,
    buildProductOrderMessage({
      productName: product.name,
      priceFcfa: product.priceFcfa,
      color: selectedColor,
      buyerName: buyerName || undefined,
      buyerEmail: buyerEmail || undefined,
    }),
  );

  function add() {
    if (outOfStock) return;
    cart.add({
      productId: product.id,
      name: product.name,
      priceFcfa: product.priceFcfa,
      color: selectedColor,
      imageUrl: product.imageUrl,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  }

  const configuredBadges = (product.badges ?? []).map(badgeMeta).filter(Boolean);
  const isNew = isNewProduct(product.createdAt);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 sm:pb-12">
      <Link
        href="/boutique"
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" /> Boutique
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Gallery images={gallery} alt={product.name} />

        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isNew && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1C1917]">
                Nouveau
              </span>
            )}
            {configuredBadges.map((m) => (
              <span
                key={m!.id}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BADGE_TONE_CLS[m!.tone] ?? "bg-ink text-paper"}`}
              >
                {m!.label}
              </span>
            ))}
          </div>

          {product.brand && (
            <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              {product.brand}
            </p>
          )}
          <h1 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{product.name}</h1>

          <p className="mt-3 text-3xl font-extrabold text-brand-deep">
            {formatFcfa(product.priceFcfa)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${TONE_TEXT[avail.tone]}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[avail.tone]}`} aria-hidden />
              {avail.label}
            </span>
          </div>

          {product.description && (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {product.description}
            </p>
          )}

          {colors.length > 0 && (
            <div className="mt-5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Couleur : <span className="text-ink">{selectedColor}</span>
              </p>
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
                      className={`h-10 w-10 rounded-full border-2 transition ${
                        active ? "border-brand-deep ring-2 ring-brand/40" : "border-line-soft"
                      }`}
                      style={{ backgroundColor: colorHex(c) }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions desktop */}
          <div className="mt-6 hidden gap-3 sm:flex">
            <ActionButtons
              added={added}
              outOfStock={outOfStock}
              onAdd={add}
              onViewCart={() => setDrawerOpen(true)}
              orderUrl={orderUrl}
            />
          </div>

          {/* Caractéristiques */}
          {product.specs && product.specs.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink">
                Caractéristiques techniques
              </h2>
              <dl className="mt-3 divide-y divide-line-soft border-y-2 border-line-soft">
                {product.specs.map((s, i) => (
                  <div key={i} className="flex justify-between gap-4 py-2.5 text-sm">
                    <dt className="text-ink-soft">{s.label}</dt>
                    <dd className="text-right font-medium text-ink">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>

      {similar.length > 0 && (
        <ProductRail title="Produits similaires" items={similar.map(toMini)} />
      )}
      {recentlyViewed.length > 0 && (
        <ProductRail title="Récemment consultés" items={recentlyViewed} />
      )}

      {/* Barre d'action collante (mobile) */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-paper p-3 sm:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-2">
          <ActionButtons
            added={added}
            outOfStock={outOfStock}
            onAdd={add}
            onViewCart={() => setDrawerOpen(true)}
            orderUrl={orderUrl}
            compact
          />
        </div>
      </div>

      {/* Panier flottant : desktop seulement (la barre collante gère le mobile) */}
      <div className="hidden sm:block">
        <FloatingCart count={cart.count} onClick={() => setDrawerOpen(true)} />
      </div>
      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} buyer={buyer} />
    </div>
  );
}

function ActionButtons({
  added,
  outOfStock,
  onAdd,
  onViewCart,
  orderUrl,
  compact,
}: {
  added: boolean;
  outOfStock: boolean;
  onAdd: () => void;
  onViewCart: () => void;
  orderUrl: string;
  compact?: boolean;
}) {
  return (
    <>
      {added ? (
        <button
          onClick={onViewCart}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-ok text-sm font-bold text-white"
        >
          <Check className="h-5 w-5" /> Voir le panier
        </button>
      ) : (
        <button
          onClick={onAdd}
          disabled={outOfStock}
          className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${
            outOfStock
              ? "cursor-not-allowed bg-clay text-ink-soft"
              : "bg-ink text-paper hover:bg-[#3A362F] active:scale-[0.99]"
          }`}
        >
          <Plus className="h-5 w-5" /> {outOfStock ? "Indisponible" : "Ajouter au panier"}
        </button>
      )}
      <a
        href={orderUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Commander via WhatsApp"
        className={`flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-line bg-paper font-bold text-ink hover:bg-clay ${
          compact ? "w-14" : "flex-1 px-4 text-sm"
        }`}
      >
        {compact ? <ExternalLink className="h-5 w-5" /> : <>WhatsApp <ExternalLink className="h-4 w-4" /></>}
      </a>
    </>
  );
}

/* ── Galerie (swipe + zoom) ─────────────────────────────────────────────── */

function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl border-2 border-line-soft bg-clay/40">
        <ShoppingBag className="h-16 w-16 text-ink-soft/20" />
      </div>
    );
  }

  function scrollTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActive(i);
  }

  return (
    <div className="lg:sticky lg:top-6 lg:self-start">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setActive(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-2xl border-2 border-line-soft [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <button
            key={i}
            onClick={() => setZoom(true)}
            aria-label="Agrandir l'image"
            className="relative aspect-square w-full shrink-0 snap-center bg-clay/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${alt} — ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-paper">
              <ZoomIn className="h-4 w-4" />
            </span>
          </button>
        ))}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              aria-label={`Image ${i + 1}`}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                active === i ? "border-ink" : "border-line-soft"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Image agrandie"
        >
          <button
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            aria-label="Fermer"
          >
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[active]} alt={alt} className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}

/* ── Rails (similaires / récemment consultés) ───────────────────────────── */

function toMini(p: ProductRow): ProductMini {
  return { id: p.id, slug: p.slug, name: p.name, brand: p.brand, priceFcfa: p.priceFcfa, imageUrl: p.imageUrl };
}

function ProductRail({ title, items }: { title: string; items: ProductMini[] }) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
        {items.map((p) => (
          <Link
            key={p.id}
            href={p.slug ? `/boutique/${p.slug}` : "#"}
            className="group w-40 shrink-0 overflow-hidden rounded-2xl border-2 border-line-soft bg-paper transition-colors hover:border-ink sm:w-auto"
          >
            <div className="aspect-square overflow-hidden bg-clay/40">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ShoppingBag className="h-7 w-7 text-ink-soft/25" />
                </div>
              )}
            </div>
            <div className="p-2.5">
              {p.brand && (
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                  {p.brand}
                </p>
              )}
              <p className="line-clamp-2 text-xs font-semibold leading-snug text-ink">{p.name}</p>
              <p className="mt-1 text-sm font-extrabold text-brand-deep">{formatFcfa(p.priceFcfa)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
