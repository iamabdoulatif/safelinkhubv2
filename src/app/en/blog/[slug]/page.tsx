import type { Metadata } from "next";
import { getPublishedPost } from "@/lib/blog/queries";
import { BlogPostPageContent } from "../../../blog/[slug]/page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: "Article not found | SafeLinkHub" };
  return { title: `${post.title} | SafeLinkHub blog`, description: post.excerpt ?? undefined };
}

export default function BlogPostPageEn({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <BlogPostPageContent locale="en" params={params} />;
}
