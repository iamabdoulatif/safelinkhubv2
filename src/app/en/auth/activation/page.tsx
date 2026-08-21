import { ActivationPageContent } from "../../../auth/activation/page";

export default function ActivationPageEn({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  return <ActivationPageContent locale="en" searchParams={searchParams} />;
}
