import type { Metadata } from "next";
import { SearchPageContent } from "../../recherche/page";

export const metadata: Metadata = {
  title: "Search | SafeLinkHub",
  description: "Search for a page, a guide or a training path on SafeLinkHub.",
  alternates: { canonical: "/en/recherche", languages: { fr: "/recherche", en: "/en/recherche" } },
};

export default function SearchPageEn({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return <SearchPageContent locale="en" searchParams={searchParams} />;
}
