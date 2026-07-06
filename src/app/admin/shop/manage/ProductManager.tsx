"use client";

// Gestion CRUD des produits (superadmin) : liste + formulaire d'ajout/édition
// (avec upload image et choix des couleurs) + suppression.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, ShoppingBag, X } from "lucide-react";
import type { ProductRow } from "@/lib/shop/service";
import { createProduct, updateProduct, deleteProduct } from "@/lib/shop/actions";
import {
  PRODUCT_CATEGORIES,
  COLOR_PALETTE,
  colorHex,
  formatFcfa,
} from "@/lib/shop/shop-config";

const INPUT_CLS = "w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:outline-none";

export default function ProductManager({ products }: { products: ProductRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    if (!confirm("Supprimer ce produit ?")) return;
    setPendingDelete(id);
    startTransition(async () => {
      await deleteProduct(id);
      setPendingDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setCreating(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-brand-deep px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Ajouter un produit
      </button>

      <div className="mt-4 space-y-2">
        {products.length === 0 ? (
          <div className="rounded-xl border border-line-soft bg-paper p-8 text-center text-sm text-ink-soft">
            Aucun produit. Ajoutez-en un pour démarrer la boutique.
          </div>
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-line-soft bg-paper p-3"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-clay/50">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <ShoppingBag className="h-5 w-5 text-ink-soft/40" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-ink">{p.name}</p>
                  {p.status === "hidden" && (
                    <span className="rounded-full bg-clay px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                      Masqué
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-soft">
                  {formatFcfa(p.priceFcfa)} · {p.stockQuantity} en stock
                  {p.category ? ` · ${p.category}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => setEditing(p)}
                  className="rounded-md border border-line-soft p-2 text-ink-soft hover:bg-clay"
                  title="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={pendingDelete === p.id}
                  className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-60"
                  title="Supprimer"
                >
                  {pendingDelete === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {(creating || editing) && (
        <ProductFormModal
          product={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(product);
  const [colors, setColors] = useState<string[]>(product?.colors ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleColor(name: string) {
    setColors((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("colors", colors.join(","));
    startTransition(async () => {
      const res = product ? await updateProduct(product.id, fd) : await createProduct(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-paper p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">
            {isEdit ? "Modifier le produit" : "Nouveau produit"}
          </h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Nom du produit *">
            <input
              name="name"
              defaultValue={product?.name ?? ""}
              required
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              defaultValue={product?.description ?? ""}
              rows={3}
              className={INPUT_CLS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix (FCFA) *">
              <input
                name="priceFcfa"
                type="number"
                min={0}
                defaultValue={product?.priceFcfa ?? ""}
                required
                className={INPUT_CLS}
              />
            </Field>
            <Field label="Quantité en stock *">
              <input
                name="stockQuantity"
                type="number"
                min={0}
                defaultValue={product?.stockQuantity ?? 0}
                required
                className={INPUT_CLS}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Catégorie">
              <select name="category" defaultValue={product?.category ?? ""} className={INPUT_CLS}>
                <option value="">—</option>
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Marque">
              <input name="brand" defaultValue={product?.brand ?? ""} className={INPUT_CLS} />
            </Field>
          </div>

          <Field label="Couleurs disponibles">
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map((c) => {
                const active = colors.includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => toggleColor(c.name)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      active ? "border-brand-deep bg-brand/10 text-ink" : "border-line-soft text-ink-soft"
                    }`}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-line-soft"
                      style={{ backgroundColor: colorHex(c.name) }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={isEdit ? "Nouvelle image (laisser vide pour garder l'actuelle)" : "Image du produit"}>
            <input
              name="image"
              type="file"
              accept="image/*"
              className="w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-clay file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
            />
          </Field>

          <Field label="Visibilité">
            <select name="status" defaultValue={product?.status ?? "active"} className={INPUT_CLS}>
              <option value="active">Visible au catalogue</option>
              <option value="hidden">Masqué</option>
            </select>
          </Field>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-brand-deep px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
