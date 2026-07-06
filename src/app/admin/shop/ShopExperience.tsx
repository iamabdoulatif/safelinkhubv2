"use client";

// Catalogue boutique (mobile-first) : recherche (suggestions + historique),
// filtres (marque / dispo / tri), catégories en carrousel, grille compacte de
// cartes image-forward liées à la fiche produit, panier flottant + tiroir.
// 100 % tokens → compatible mode sombre.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Plus,
  Check,
  Search,
  X,
  Sparkles,
  SlidersHorizontal,
  Clock,
  TrendingUp,
} from "lucide-react";
import type { ProductRow } from "@/lib/shop/service";
import { CartProvider, useCart } from "@/lib/shop/cart";
import { availabilityOf, isNewProduct, type AvailabilityTone } from "@/lib/shop/product-status";
import { badgeMeta, formatFcfa } from "@/lib/shop/shop-config";
import { FloatingCart, CartDrawer, type Buyer } from "@/components/shop/cart-ui";

type SortKey = "relevance" | "price_asc" | "price_desc" | "newest";
const SEARCH_HISTORY_KEY = "slh_shop_search_v1";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filtres
  const [brands, setBrands] = useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("relevance");

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

  const allBrands = useMemo(
    () =>
      Array.from(new Set(products.map((p) => p.brand).filter((b): b is string => Boolean(b)))).sort(
        (a, b) => a.localeCompare(b, "fr"),
      ),
    [products],
  );

  const countFor = (c: string) => products.filter((p) => p.category === c).length;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = products.filter((p) => {
      if (category && p.category !== category) return false;
      if (brands.length && (!p.brand || !brands.includes(p.brand))) return false;
      if (inStockOnly && p.stockQuantity <= 0) return false;
      if (!q) return true;
      return [p.name, p.brand, p.description, p.category]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q));
    });
    const sorted = [...list];
    if (sort === "price_asc") sorted.sort((a, b) => a.priceFcfa - b.priceFcfa);
    else if (sort === "price_desc") sorted.sort((a, b) => b.priceFcfa - a.priceFcfa);
    else if (sort === "newest")
      sorted.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return sorted;
  }, [products, category, brands, inStockOnly, sort, q]);

  const activeFilterCount = brands.length + (inStockOnly ? 1 : 0) + (sort !== "relevance" ? 1 : 0);
  const openCart = () => setDrawerOpen(true);

  return (
    <div className="mt-5">
      {/* Recherche + filtres */}
      <div className="flex items-stretch gap-2">
        <SearchBox products={products} query={query} setQuery={setQuery} />
        <button
          onClick={() => setFiltersOpen(true)}
          aria-label="Filtres"
          className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border-2 border-line-soft bg-paper text-ink hover:border-ink"
        >
          <SlidersHorizontal className="h-5 w-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-[#1C1917]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Carrousel catégories */}
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

      {/* Grille */}
      {filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border-2 border-line bg-paper p-10 text-center text-sm text-ink-soft">
          {q
            ? `Aucun produit ne correspond à « ${query.trim()} ».`
            : "Aucun produit ne correspond à ces filtres."}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} onAdd={cart.add} onViewCart={openCart} />
          ))}
        </div>
      )}

      <FloatingCart count={cart.count} onClick={openCart} />
      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} buyer={buyer} />
      <FiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        allBrands={allBrands}
        brands={brands}
        setBrands={setBrands}
        inStockOnly={inStockOnly}
        setInStockOnly={setInStockOnly}
        sort={sort}
        setSort={setSort}
        resultCount={filtered.length}
      />
    </div>
  );
}

/* ── Recherche (suggestions + historique) ──────────────────────────────── */

function SearchBox({
  products,
  query,
  setQuery,
}: {
  products: ProductRow[];
  query: string;
  setQuery: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  function commit(term: string) {
    const t = term.trim();
    setQuery(t);
    if (!t) return;
    setHistory((prev) => {
      const next = [t, ...prev.filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setFocused(false);
  }

  const q = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return [];
    const seen = new Set<string>();
    const out: { label: string; sub?: string; slug: string | null }[] = [];
    for (const p of products) {
      if (out.length >= 6) break;
      if (p.name.toLowerCase().includes(q) && !seen.has(p.name)) {
        seen.add(p.name);
        out.push({ label: p.name, sub: p.brand ?? undefined, slug: p.slug });
      }
    }
    return out;
  }, [products, q]);

  const popular = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).slice(0, 5) as string[],
    [products],
  );

  const showPanel = focused && (suggestions.length > 0 || (!q && (history.length > 0 || popular.length > 0)));

  return (
    <div ref={boxRef} className="relative flex-1">
      <div className="flex items-center rounded-2xl border-2 border-line-soft bg-paper focus-within:border-ink">
        <Search className="ml-3 h-5 w-5 shrink-0 text-ink-soft" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(query);
            if (e.key === "Escape") setFocused(false);
          }}
          placeholder="Rechercher un routeur, une marque…"
          aria-label="Rechercher dans la boutique"
          enterKeyHint="search"
          className="h-11 w-full bg-transparent px-2.5 text-[15px] text-ink placeholder:text-ink-soft focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="mr-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border-2 border-line bg-paper shadow-[4px_4px_0_var(--color-line-soft)]">
          {suggestions.length > 0 ? (
            <ul>
              {suggestions.map((s) => (
                <li key={s.label}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(s.label)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-clay"
                  >
                    <Search className="h-4 w-4 shrink-0 text-ink-soft" />
                    <span className="truncate text-ink">{s.label}</span>
                    {s.sub && <span className="ml-auto shrink-0 text-xs text-ink-soft">{s.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-2">
              {history.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    Recherches récentes
                  </p>
                  {history.map((h) => (
                    <button
                      key={h}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => commit(h)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-clay"
                    >
                      <Clock className="h-4 w-4 shrink-0 text-ink-soft" />
                      <span className="truncate text-ink">{h}</span>
                    </button>
                  ))}
                </div>
              )}
              {popular.length > 0 && (
                <div>
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                    Marques populaires
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-2 pb-1 pt-0.5">
                    {popular.map((p) => (
                      <button
                        key={p}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => commit(p)}
                        className="inline-flex items-center gap-1 rounded-full border border-line-soft px-2.5 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
                      >
                        <TrendingUp className="h-3 w-3" />
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Filtres ────────────────────────────────────────────────────────────── */

const SORTS: { key: SortKey; label: string }[] = [
  { key: "relevance", label: "Pertinence" },
  { key: "newest", label: "Nouveautés" },
  { key: "price_asc", label: "Prix croissant" },
  { key: "price_desc", label: "Prix décroissant" },
];

function FiltersDrawer({
  open,
  onClose,
  allBrands,
  brands,
  setBrands,
  inStockOnly,
  setInStockOnly,
  sort,
  setSort,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  allBrands: string[];
  brands: string[];
  setBrands: (v: string[]) => void;
  inStockOnly: boolean;
  setInStockOnly: (v: boolean) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  resultCount: number;
}) {
  function toggleBrand(b: string) {
    setBrands(brands.includes(b) ? brands.filter((x) => x !== b) : [...brands, b]);
  }
  function reset() {
    setBrands([]);
    setInStockOnly(false);
    setSort("relevance");
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filtres"
        className={`absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl border-t-2 border-line bg-paper transition-transform duration-300 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-96 sm:max-h-none sm:rounded-none sm:border-l-2 ${
          open ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b-2 border-line p-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <SlidersHorizontal className="h-5 w-5" /> Filtres
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Trier par</h3>
            <div className="grid grid-cols-2 gap-2">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`h-11 rounded-xl border-2 px-3 text-sm font-semibold ${
                    sort === s.key
                      ? "border-brand bg-brand text-[#1C1917]"
                      : "border-line-soft bg-paper text-ink-soft hover:border-ink hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Disponibilité</h3>
            <label className="flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border-2 border-line-soft px-3">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="h-4 w-4 accent-brand-deep"
              />
              <span className="text-sm text-ink">En stock uniquement</span>
            </label>
          </section>

          {allBrands.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Marque</h3>
              <div className="flex flex-wrap gap-2">
                {allBrands.map((b) => {
                  const active = brands.includes(b);
                  return (
                    <button
                      key={b}
                      onClick={() => toggleBrand(b)}
                      aria-pressed={active}
                      className={`h-10 rounded-full border-2 px-3.5 text-sm font-medium ${
                        active
                          ? "border-brand bg-brand text-[#1C1917]"
                          : "border-line-soft bg-paper text-ink-soft hover:border-ink hover:text-ink"
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div
          className="flex gap-2 border-t-2 border-line p-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={reset}
            className="h-12 flex-1 rounded-xl border-2 border-line px-4 text-sm font-bold text-ink hover:bg-clay"
          >
            Réinitialiser
          </button>
          <button
            onClick={onClose}
            className="h-12 flex-[2] rounded-xl bg-ink px-4 text-sm font-bold text-paper hover:bg-[#3A362F]"
          >
            Voir {resultCount} produit{resultCount > 1 ? "s" : ""}
          </button>
        </div>
      </aside>
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

/* ── Image + skeleton ───────────────────────────────────────────────────── */

function ProductImage({ src, alt, eager }: { src: string | null; alt: string; eager?: boolean }) {
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
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/* ── Badges & disponibilité ─────────────────────────────────────────────── */

const TONE_TEXT: Record<AvailabilityTone, string> = { ok: "text-ok", low: "text-warn", out: "text-err" };
const TONE_DOT: Record<AvailabilityTone, string> = { ok: "bg-ok", low: "bg-warn", out: "bg-err" };

function AvailabilityPill({ stock }: { stock: number }) {
  const a = availabilityOf(stock);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${TONE_TEXT[a.tone]}`}>
      <span className={`h-2 w-2 rounded-full ${TONE_DOT[a.tone]}`} aria-hidden />
      {a.label}
    </span>
  );
}

const BADGE_TONE_CLS: Record<string, string> = {
  err: "bg-err text-white",
  brand: "bg-brand text-[#1C1917]",
  ok: "bg-ok text-white",
  ink: "bg-ink text-paper",
};

function ConfigurableBadges({ ids }: { ids: string[] }) {
  const metas = ids.map(badgeMeta).filter(Boolean);
  if (metas.length === 0) return null;
  return (
    <>
      {metas.map((m) => (
        <span
          key={m!.id}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BADGE_TONE_CLS[m!.tone] ?? "bg-ink text-paper"}`}
        >
          {m!.label}
        </span>
      ))}
    </>
  );
}

/* ── Carte produit ──────────────────────────────────────────────────────── */

function ProductCard({
  product,
  onAdd,
  onViewCart,
}: {
  product: ProductRow;
  onAdd: ReturnType<typeof useCart>["add"];
  onViewCart: () => void;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const outOfStock = product.stockQuantity <= 0;
  const isNew = isNewProduct(product.createdAt);
  const href = product.slug ? `/boutique/${product.slug}` : "#";

  function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    onAdd({
      productId: product.id,
      name: product.name,
      priceFcfa: product.priceFcfa,
      color: product.colors?.[0] ?? null,
      imageUrl: product.imageUrl,
    });
    setJustAdded(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setJustAdded(false), 2200);
  }

  return (
    <Link
      href={href}
      aria-label={`Voir ${product.name}`}
      className="group flex flex-col overflow-hidden rounded-2xl border-2 border-line-soft bg-paper transition-[transform,border-color] duration-150 hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99] motion-reduce:transition-none"
    >
      <div className="relative aspect-square overflow-hidden bg-clay/40">
        <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none">
          <ProductImage src={product.imageUrl} alt={product.name} />
        </div>
        <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start gap-1">
          {isNew && !outOfStock && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1C1917]">
              <Sparkles className="h-3 w-3" /> Nouveau
            </span>
          )}
          <ConfigurableBadges ids={product.badges ?? []} />
          {outOfStock && (
            <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-paper">
              Rupture
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        {product.brand && (
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            {product.brand}
          </p>
        )}
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {product.name}
        </h3>
        <p className="mt-1.5 text-lg font-extrabold text-brand-deep">{formatFcfa(product.priceFcfa)}</p>
        <div className="mt-1">
          <AvailabilityPill stock={product.stockQuantity} />
        </div>
        {product.description && (
          <p className="mt-1.5 line-clamp-1 text-xs text-ink-soft">{product.description}</p>
        )}

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
                e.preventDefault();
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
    </Link>
  );
}
