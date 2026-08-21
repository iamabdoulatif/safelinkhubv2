"use client";

// Expérience blog publique : hero « terminal », recherche, sidebar de
// catégories (sujets) et grille d'articles filtrable. Design Bitume
// (brutaliste-éditorial, aucune ombre diffuse ni dégradé) façon journal
// technologique.

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, X, ArrowUpRight, Newspaper } from "lucide-react";
import BlogAd from "@/components/analytics/BlogAd";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/fr";

export type BlogListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
};

function formatDate(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function BlogExperience({
  posts,
  categories,
  ad,
  locale,
  t,
  initialCategory = null,
}: {
  posts: BlogListItem[];
  categories: string[];
  ad: { client: string; slot: string } | null;
  locale: Locale;
  t: Dictionary["blog"];
  initialCategory?: string | null;
}) {
  const [category, setCategory] = useState<string | null>(
    initialCategory && categories.includes(initialCategory) ? initialCategory : null,
  );
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return posts.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return [p.title, p.excerpt, p.category]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q));
    });
  }, [posts, category, q]);

  const countFor = (c: string) => posts.filter((p) => p.category === c).length;
  const unfiltered = category === null && q === "";

  return (
    <div>
      {/* ── Hero terminal (bande anthracite) ───────────────────────────── */}
      <div className="border-b border-line bg-slate-deep">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">
            <span className="inline-block h-2 w-2 rounded-full bg-brand" />
            {t.journal}
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">
            {t.title} <span className="marker">{t.titleMark}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-slate-deep-soft">
            {t.lead}
          </p>

          {/* Recherche façon ligne de commande */}
          <div className="mt-8 flex items-center gap-3 rounded-full border border-slate-deep-line bg-[#0E2618] px-5 py-3">
            <span className="font-mono text-sm text-brand">&gt;_</span>
            <Search className="h-4 w-4 shrink-0 text-slate-deep-soft" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchLabel}
              className="w-full bg-transparent text-sm text-white placeholder:text-slate-deep-soft focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label={t.clearSearch}
                className="shrink-0 text-slate-deep-soft hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-deep-soft">
            {posts.length} {posts.length > 1 ? t.articleMany : t.articleOne} · {categories.length}{" "}
            {categories.length > 1 ? t.topicMany : t.topicOne}
          </p>
        </div>
      </div>

      {/* ── Corps : sidebar catégories + grille ────────────────────────── */}
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
        {/* Sidebar sujets */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-3 hidden text-[11px] font-semibold uppercase tracking-wider text-ink-soft lg:block">{t.topics}</p>
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-0">
            <SidebarItem
              active={category === null}
              onClick={() => setCategory(null)}
              label={t.allTopics}
              count={posts.length}
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

        {/* Grille d'articles */}
        <div className="mt-8 lg:mt-0">
          {filtered.length === 0 ? (
            <div className="slate-card bg-paper p-12 text-center">
              <Newspaper className="mx-auto h-8 w-8 text-ink-soft/40" />
              <p className="mt-3 font-semibold text-ink">
                {q || category
                  ? t.noMatches
                  : t.noPosts}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {q || category
                  ? t.tryAgain
                  : t.checkBack}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {filtered.map((post, i) => (
                <PostCard
                  key={post.id}
                  post={post}
                  index={i}
                  featured={unfiltered && i === 0}
                  locale={locale}
                  t={t}
                />
              ))}
              {ad && (
                <div className="slate-card bg-clay p-4 sm:col-span-2">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-soft">
                    {t.advertising}
                  </p>
                  <BlogAd client={ad.client} slot={ad.slot} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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
      className={`inline-flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors lg:w-full lg:text-left ${
        active
          ? "border-transparent bg-brand text-slate-deep"
          : "border-line bg-paper text-ink-soft hover:bg-clay hover:text-ink"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`shrink-0 font-mono text-xs ${active ? "text-[#1C1917]/70" : "text-ink-soft/70"}`}>
        {String(count).padStart(2, "0")}
      </span>
    </button>
  );
}

function PostCard({
  post,
  index,
  featured,
  locale,
  t,
}: {
  post: BlogListItem;
  index: number;
  featured: boolean;
  locale: Locale;
  t: Dictionary["blog"];
}) {
  const date = post.publishedAt ?? post.createdAt;

  return (
    <Link
      href={`${locale === "en" ? "/en" : ""}/blog/${post.slug}`}
      className={`slate-card group flex flex-col overflow-hidden bg-paper transition-shadow hover:shadow-[0_12px_32px_-14px_rgba(16,22,15,0.18)] ${
        featured ? "sm:col-span-2 sm:flex-row" : ""
      }`}
    >
      {/* Visuel / placeholder */}
      <div
        className={`relative overflow-hidden border-line ${
          featured ? "border-b-2 sm:w-1/2 sm:border-b-0 sm:border-r-2" : "border-b-2"
        }`}
      >
        {post.coverImageUrl ? (
          <Image
            src={post.coverImageUrl}
            alt=""
            width={800}
            height={featured ? 600 : 450}
            unoptimized
            className={`w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${
              featured ? "h-full min-h-56" : "aspect-[16/10]"
            }`}
          />
        ) : (
          <div
            className={`flex items-center justify-center bg-clay ${
              featured ? "h-full min-h-56" : "aspect-[16/10]"
            }`}
          >
            <span className="font-display text-6xl font-bold text-ink-soft/15">
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      {/* Contenu */}
      <div className={`flex flex-1 flex-col p-5 ${featured ? "sm:justify-center sm:p-8" : ""}`}>
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-soft">
          <time>{formatDate(date, locale)}</time>
          {post.category && (
            <>
              <span aria-hidden>·</span>
              <span className="rounded bg-brand px-1.5 py-0.5 font-semibold uppercase tracking-wide text-slate-deep">
                {post.category}
              </span>
            </>
          )}
        </div>
        <h2
          className={`mt-2 font-display font-bold leading-snug text-ink group-hover:text-brand-deep ${
            featured ? "text-2xl sm:text-3xl" : "text-lg"
          }`}
        >
          {post.title}
        </h2>
        {post.excerpt && (
          <p
            className={`mt-2 text-sm leading-relaxed text-ink-soft ${
              featured ? "line-clamp-3" : "line-clamp-2"
            }`}
          >
            {post.excerpt}
          </p>
        )}
        <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-bold text-brand-deep">
          {t.readArticle}
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </div>
    </Link>
  );
}
