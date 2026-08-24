import Link from "next/link";
import { previewInvitation } from "@/lib/org/invitation-actions";
import { roleLabel } from "@/lib/auth/roles";
import JoinForm from "./JoinForm";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const apercu = await previewInvitation(token);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="font-display text-2xl font-bold text-ink">Rejoindre un compte SafeLinkHub</h1>
      <div className="mt-6">
        {apercu.ok ? (
          <JoinForm
            token={token}
            orgName={apercu.orgName}
            email={apercu.email}
            roleLabel={roleLabel(apercu.role)}
          />
        ) : (
          <div className="rounded-xl border border-err bg-err-soft p-6">
            <p className="text-sm text-err">{apercu.error}</p>
            <Link href="/" className="mt-4 inline-block text-sm font-semibold text-brand-deep hover:underline">
              Retour à l&apos;accueil
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
