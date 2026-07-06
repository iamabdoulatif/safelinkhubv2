"use client";

// Panier client (localStorage) — fonctionne pour tout le monde (visiteurs
// anonymes comme utilisateurs connectés), sans backend. La commande se fait
// ensuite via WhatsApp. Une même référence dans deux couleurs = deux lignes.

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  productId: string;
  name: string;
  priceFcfa: number;
  color: string | null;
  quantity: number;
  imageUrl: string | null;
};

const STORAGE_KEY = "slh_cart_v1";

function lineKey(productId: string, color: string | null): string {
  return `${productId}::${color ?? ""}`;
}

type CartContextValue = {
  items: CartItem[];
  count: number;
  total: number;
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQuantity: (productId: string, color: string | null, quantity: number) => void;
  remove: (productId: string, color: string | null) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate depuis localStorage après le montage (évite un décalage SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* stockage indisponible : panier vide */
    }
    setHydrated(true);
  }, []);

  // Persiste à chaque changement (une fois hydraté).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, hydrated]);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((n, i) => n + i.quantity, 0);
    const total = items.reduce((n, i) => n + i.quantity * i.priceFcfa, 0);
    return {
      items,
      count,
      total,
      add: (item, quantity = 1) =>
        setItems((prev) => {
          const key = lineKey(item.productId, item.color);
          const existing = prev.find((i) => lineKey(i.productId, i.color) === key);
          if (existing) {
            return prev.map((i) =>
              lineKey(i.productId, i.color) === key ? { ...i, quantity: i.quantity + quantity } : i,
            );
          }
          return [...prev, { ...item, quantity }];
        }),
      setQuantity: (productId, color, quantity) =>
        setItems((prev) => {
          const key = lineKey(productId, color);
          if (quantity <= 0) return prev.filter((i) => lineKey(i.productId, i.color) !== key);
          return prev.map((i) =>
            lineKey(i.productId, i.color) === key ? { ...i, quantity } : i,
          );
        }),
      remove: (productId, color) =>
        setItems((prev) =>
          prev.filter((i) => lineKey(i.productId, i.color) !== lineKey(productId, color)),
        ),
      clear: () => setItems([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart doit être utilisé dans un CartProvider");
  return ctx;
}
