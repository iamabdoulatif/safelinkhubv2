import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { listPublishedPosts, listPublishedCategories } from "@/lib/blog/queries";
import { getMarketingSettings } from "@/lib/marketing/queries";
import BlogExperience from "./BlogExperience";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePrefix, type Locale } from "@/lib/i18n/config";

export const metadata: Metadata = {
  title: "Blog | SafeLinkHub",
  description:
    "Actualités, guides et conseils SafeLinkHub pour gérer et monétiser vos hotspots Wi-Fi MikroTik.",
};

export async function BlogPageContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<{ sujet?: string }>;
}) {
  const [{ sujet }, posts, categories, marketing, dict] = await Promise.all([
    searchParams,
    listPublishedPosts(),
    listPublishedCategories(),
    getMarketingSettings(),
    getDictionary(locale),
  ]);

  const ad =
    marketing.adsenseEnabled && marketing.adsenseClientId && marketing.adsenseSlotId
      ? { client: marketing.adsenseClientId, slot: marketing.adsenseSlotId }
      : null;

  return (
    <div className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        <BlogExperience
          posts={posts}
          categories={categories}
          ad={ad}
          initialCategory={sujet ?? null}
          locale={locale}
          t={dict.blog}
        />
      </main>
      <LandingFooter anchorPrefix={localePrefix(locale) || "/"} dict={dict} locale={locale} />
    </div>
  );
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ sujet?: string }>;
}) {
  return <BlogPageContent locale="fr" searchParams={searchParams} />;
}
