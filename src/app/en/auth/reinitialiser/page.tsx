import { ResetPasswordPageContent } from "../../../auth/reinitialiser/page";

export default function ResetPasswordPageEn({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <ResetPasswordPageContent locale="en" searchParams={searchParams} />;
}
