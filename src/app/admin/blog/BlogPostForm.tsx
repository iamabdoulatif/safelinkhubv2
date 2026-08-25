"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveBlogPost } from "@/lib/blog/actions";
import { CHANNEL_LABEL, type ShareChannel } from "@/lib/social/channels";
import WysiwygEditor from "@/components/content/WysiwygEditor";
import SeoPanel from "@/components/content/SeoPanel";

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
    focusKeyword?: string | null;
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

  /* Le panneau de référencement lit les champs À LA FRAPPE : ils sont donc
     contrôlés ici, et non laissés en `defaultValue`. */
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(post?.coverImageUrl ?? "");
  const [keyword, setKeyword] = useState(post?.focusKeyword ?? "");

  return (
    <form action={formAction} className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="border border-line bg-paper p-6 rounded-xl">
      {post && <input type="hidden" name="id" value={post.id} />}

      {state?.error && (
        <p className="mb-4 rounded-md bg-err-soft px-3 py-2 text-sm text-err">
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
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
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
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
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
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
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="Résumé en une ou deux phrases."
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="post-content" className="mb-1 block text-sm font-medium text-ink">
            Contenu
          </label>
          <WysiwygEditor
            id="post-content"
            name="content"
            defaultValue={post?.content ?? ""}
            onChangeValue={setContent}
            placeholder="Rédigez votre article — le texte s'affiche ici tel qu'il paraîtra."
          />
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
      </div>

      {/* Colonne d'analyse — collante, pour rester lisible pendant qu'on écrit. */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <SeoPanel
          keywordName="focusKeyword"
          keyword={keyword}
          onKeywordChange={setKeyword}
          title={title}
          slug={slug}
          excerpt={excerpt}
          content={content}
          coverImageUrl={coverImageUrl}
        />
      </div>
    </form>
  );
}
