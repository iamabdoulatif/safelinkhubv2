import { RegisterPageContent } from "../../../auth/register/page";

export default function RegisterPageEn({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  return <RegisterPageContent locale="en" searchParams={searchParams} />;
}
