import { ActivationSentPageContent } from "../../../auth/activation-envoyee/page";

export default function ActivationSentPageEn({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  return <ActivationSentPageContent locale="en" searchParams={searchParams} />;
}
