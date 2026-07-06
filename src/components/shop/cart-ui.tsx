"use client";

// UI panier réutilisable (bouton flottant + tiroir), partagée par le
// catalogue (ShopExperience) et la fiche produit. Tout en tokens → dark-ready.

import { ShoppingBag, ShoppingCart, ExternalLink, Plus, Minus, Trash2, X } from "lucide-react";
import { useCart } from "@/lib/shop/cart";
import { buildCartOrderMessage, buildWhatsappLink, formatFcfa } from "@/lib/shop/shop-config";

export type Buyer = { whatsappNumber: string; buyerName: string; buyerEmail: string };

export function FloatingCart({ count, onClick }: { count: number; onClick: () => void }) {
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

export function CartDrawer({
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
