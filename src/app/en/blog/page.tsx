import type { Metadata } from "next";
import { BlogPageContent } from "../../blog/page";

export const metadata: Metadata = {
  title: "Blog | SafeLinkHub",
  description:
    "SafeLinkHub news, guides and advice for managing and monetizing MikroTik Wi-Fi hotspots.",
  alternates: { canonical: "/en/blog", languages: { fr: "/blog", en: "/en/blog" } },
};

export default function BlogPageEn({
  searchParams,
}: {
  searchParams: Promise<{ sujet?: string }>;
}) {
  return <BlogPageContent locale="en" searchParams={searchParams} />;
}
