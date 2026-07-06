"use client";

// Gestion CRUD des produits (superadmin) : liste + formulaire d'ajout/édition
// (avec upload image et choix des couleurs) + suppression.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2, ShoppingBag, X, Tag, Check } from "lucide-react";
import type { ProductRow, CategoryRow } from "@/lib/shop/service";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  renameCategory,
  deleteCategory,
} from "@/lib/shop/actions";
import { BADGE_CATALOG, COLOR_PALETTE, colorHex, formatFcfa } from "@/lib/shop/shop-config";

const INPUT_CLS = "w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:outline-none";

export default function ProductManager({
  products,
  categories,
}: {
  products: ProductRow[];
  categories: CategoryRow[];
}) {
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
      <CategoryManager categories={categories} />

      <button
        onClick={() => setCreating(true)}
        className="mt-8 inline-flex items-center gap-1.5 rounded-md bg-brand-deep px-4 py-2 text-sm font-medium text-white hover:opacity-90"
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
          categories={categories}
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
  categories,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  categories: CategoryRow[];
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
          <Field label="Identifiant URL (slug)">
            <input
              name="slug"
              defaultValue={product?.slug ?? ""}
              placeholder="généré depuis le nom si vide — ex. mikrotik-hap-ax"
              className={`${INPUT_CLS} font-mono`}
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
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
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

          <Field label="Image principale — URL">
            <input
              name="imageUrlText"
              defaultValue={product?.imageUrl ?? ""}
              placeholder="/shop/produit.jpg ou https://…"
              className={`${INPUT_CLS} font-mono`}
            />
            <p className="mt-1 text-xs text-ink-soft">
              Recommandé (le stockage de fichiers n&apos;est pas activé). Le champ fichier
              ci-dessous ne fonctionne que si Vercel Blob est configuré.
            </p>
          </Field>
          <Field label={isEdit ? "…ou téléverser une nouvelle image" : "…ou téléverser un fichier"}>
            <input
              name="image"
              type="file"
              accept="image/*"
              className="w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-clay file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
            />
          </Field>
          <Field label="Galerie — URLs supplémentaires (une par ligne)">
            <textarea
              name="galleryUrls"
              defaultValue={(product?.images ?? []).join("\n")}
              rows={3}
              placeholder={"/shop/produit-2.jpg\nhttps://…/produit-3.jpg"}
              className={`${INPUT_CLS} font-mono`}
            />
          </Field>

          <Field label="Badges (affichés sur la carte et la fiche)">
            <div className="flex flex-wrap gap-2">
              {BADGE_CATALOG.map((b) => (
                <label
                  key={b.id}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line-soft px-2.5 py-1 text-xs text-ink has-[:checked]:border-brand-deep has-[:checked]:bg-brand/10"
                >
                  <input
                    type="checkbox"
                    name="badges"
                    value={b.id}
                    defaultChecked={product?.badges?.includes(b.id) ?? false}
                    className="h-3.5 w-3.5 accent-brand-deep"
                  />
                  {b.label}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Caractéristiques techniques (une par ligne : « Libellé: valeur »)">
            <textarea
              name="specs"
              defaultValue={(product?.specs ?? []).map((s) => `${s.label}: ${s.value}`).join("\n")}
              rows={4}
              placeholder={"Débit: 1 Gbps\nPorts: 5x RJ45\nAlimentation: PoE"}
              className={INPUT_CLS}
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

// Gestion des catégories (superadmin) : ajout, renommage inline, suppression.
function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await createCategory(name);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setNewName("");
      router.refresh();
    });
  }

  function saveRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await renameCategory(id, name);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Supprimer la catégorie « ${name} » ? Les produits associés repasseront à "sans catégorie".`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      await deleteCategory(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-line-soft bg-paper p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Tag className="h-4 w-4" /> Catégories
      </h2>
      <p className="mt-0.5 text-xs text-ink-soft">
        Elles apparaissent dans la sidebar du catalogue et dans le formulaire produit.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {categories.length === 0 && (
          <span className="text-xs text-ink-soft">Aucune catégorie pour l&apos;instant.</span>
        )}
        {categories.map((c) =>
          editingId === c.id ? (
            <div
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full border border-brand-deep bg-brand/5 py-0.5 pl-2.5 pr-1"
            >
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename(c.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                autoFocus
                className="w-28 bg-transparent text-xs text-ink focus:outline-none"
              />
              <button
                onClick={() => saveRename(c.id)}
                disabled={pending}
                className="rounded-full p-1 text-green-600 hover:bg-green-50"
                title="Enregistrer"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded-full p-1 text-ink-soft hover:bg-clay"
                title="Annuler"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div
              key={c.id}
              className="group inline-flex items-center gap-1 rounded-full border border-line-soft bg-paper py-1 pl-3 pr-1.5 text-xs text-ink"
            >
              {c.name}
              <button
                onClick={() => {
                  setEditingId(c.id);
                  setEditName(c.name);
                  setError(null);
                }}
                className="rounded-full p-1 text-ink-soft hover:bg-clay hover:text-ink"
                title="Renommer"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDelete(c.id, c.name)}
                disabled={pending}
                className="rounded-full p-1 text-ink-soft hover:bg-red-50 hover:text-red-600"
                title="Supprimer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ),
        )}
      </div>

      <form onSubmit={handleAdd} className="mt-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nouvelle catégorie"
          className="flex-1 rounded-md border border-line-soft px-3 py-1.5 text-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !newName.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ajouter
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
