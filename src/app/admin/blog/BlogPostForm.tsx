"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveBlogPost } from "@/lib/blog/actions";
import { CHANNEL_LABEL, type ShareChannel } from "@/lib/social/channels";

type BlogPostFormProps = {
  post?: {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    category: string | null;
    content: string;
    coverImageUrl: string | null;
    published: boolean;
  };
  categories?: string[];
  /** Canaux réellement configurés en réglages. Vide = bloc masqué. */
  shareChannels?: ShareChannel[];
  /** Canaux déjà diffusés pour cet article — leur case part décochée. */
  alreadyShared?: string[];
};

export default function BlogPostForm({
  post,
  categories = [],
  shareChannels = [],
  alreadyShared = [],
}: BlogPostFormProps) {
  const [state, formAction, pending] = useActionState(saveBlogPost, undefined);

  return (
    <form action={formAction} className="max-w-3xl border border-line bg-paper p-6 rounded-xl">
      {post && <input type="hidden" name="id" value={post.id} />}

      {state?.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="post-title" className="mb-1 block text-sm font-medium text-ink">
            Titre
          </label>
          <input
            id="post-title"
            name="title"
            required
            defaultValue={post?.title}
            placeholder="Ex : Monétiser son hotspot Wi-Fi avec le mobile money"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="post-slug" className="mb-1 block text-sm font-medium text-ink">
            Slug <span className="font-normal text-ink-soft">(optionnel — généré depuis le titre si vide)</span>
          </label>
          <input
            id="post-slug"
            name="slug"
            defaultValue={post?.slug}
            placeholder="monetiser-son-hotspot-wifi"
            className="w-full rounded-md border border-line-soft px-3 py-2 font-mono text-sm focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="post-category" className="mb-1 block text-sm font-medium text-ink">
            Catégorie <span className="font-normal text-ink-soft">(optionnel — sujet affiché dans la sidebar du blog)</span>
          </label>
          <input
            id="post-category"
            name="category"
            list="blog-category-suggestions"
            defaultValue={post?.category ?? ""}
            placeholder="Ex : MikroTik, Mobile Money, Tutoriels"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
          <datalist id="blog-category-suggestions">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="post-cover" className="mb-1 block text-sm font-medium text-ink">
            Image de couverture <span className="font-normal text-ink-soft">(optionnel — chemin /blog/… ou URL https)</span>
          </label>
          <input
            id="post-cover"
            name="coverImageUrl"
            defaultValue={post?.coverImageUrl ?? ""}
            placeholder="/blog/mobile-money.svg"
            className="w-full rounded-md border border-line-soft px-3 py-2 font-mono text-sm focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="post-excerpt" className="mb-1 block text-sm font-medium text-ink">
            Extrait <span className="font-normal text-ink-soft">(optionnel — affiché dans la liste et le SEO)</span>
          </label>
          <textarea
            id="post-excerpt"
            name="excerpt"
            rows={2}
            defaultValue={post?.excerpt ?? ""}
            placeholder="Résumé en une ou deux phrases."
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="post-content" className="mb-1 block text-sm font-medium text-ink">
            Contenu
          </label>
          <textarea
            id="post-content"
            name="content"
            required
            rows={16}
            defaultValue={post?.content}
            placeholder={"Texte de l'article.\n\nSéparez les paragraphes par une ligne vide. Commencez une ligne par « ## » pour un sous-titre."}
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm leading-relaxed focus:border-line-soft focus:outline-none"
          />
          <p className="mt-1 text-xs text-ink-soft">
            Paragraphes séparés par une ligne vide — « ## Mon titre » crée un sous-titre.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            name="published"
            defaultChecked={post?.published}
            className="h-4 w-4 accent-slate-deep"
          />
          Publier l&apos;article (visible sur /blog)
        </label>

        {shareChannels.length > 0 && (
          <fieldset className="rounded-xl border border-line bg-clay p-4">
            <legend className="px-1 text-sm font-semibold text-ink">
              Diffuser à la publication
            </legend>
            <p className="mb-3 text-xs text-ink-soft">
              L&apos;envoi part une fois l&apos;article enregistré, sans bloquer
              cette page. Un canal déjà diffusé n&apos;est jamais reposté.
            </p>
            <div className="space-y-2">
              {shareChannels.map((channel) => {
                const done = alreadyShared.includes(channel);
                return (
                  <label
                    key={channel}
                    className="flex items-center gap-2 text-sm font-medium text-ink"
                  >
                    <input
                      type="checkbox"
                      name={`share_${channel}`}
                      defaultChecked={!done}
                      className="h-4 w-4 accent-slate-deep"
                    />
                    {CHANNEL_LABEL[channel]}
                    {done && (
                      <span className="text-xs font-normal text-ink-soft">— déjà diffusé</span>
                    )}
                  </label>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              WhatsApp n&apos;est pas proposé&nbsp;: l&apos;API Groupes de Meta
              plafonne un groupe à 8 participants, ce qui exclut un groupe
              communautaire.
            </p>
          </fieldset>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="border border-line bg-brand px-5 py-2 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60 rounded-full"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <Link
          href="/admin/blog"
          className="border border-line px-5 py-2 text-sm font-bold text-ink hover:bg-clay rounded-xl"
        >
          Annuler
        </Link>
      </div>
    </form>
  );
}
