import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { listPublishedPosts, listPublishedCategories } from "@/lib/blog/queries";
import { getMarketingSettings } from "@/lib/marketing/queries";
import BlogExperience from "./BlogExperience";

export const metadata: Metadata = {
  title: "Blog | SafeLinkHub",
  description:
    "Actualités, guides et conseils SafeLinkHub pour gérer et monétiser vos hotspots Wi-Fi MikroTik.",
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ sujet?: string }>;
}) {
  const [{ sujet }, posts, categories, marketing] = await Promise.all([
    searchParams,
    listPublishedPosts(),
    listPublishedCategories(),
    getMarketingSettings(),
  ]);

  const ad =
    marketing.adsenseEnabled && marketing.adsenseClientId && marketing.adsenseSlotId
      ? { client: marketing.adsenseClientId, slot: marketing.adsenseSlotId }
      : null;

  return (
    <div className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix="/" />
      <main className="flex-1 bg-paper">
        <BlogExperience
          posts={posts}
          categories={categories}
          ad={ad}
          initialCategory={sujet ?? null}
        />
      </main>
      <LandingFooter anchorPrefix="/" />
    </div>
  );
}
