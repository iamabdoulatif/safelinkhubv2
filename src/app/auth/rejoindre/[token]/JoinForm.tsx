"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { acceptInvitation } from "@/lib/org/invitation-actions";

type Etat = { error?: string; success?: true } | null;

export default function JoinForm({
  token,
  orgName,
  email,
  roleLabel,
}: {
  token: string;
  orgName: string;
  email: string;
  roleLabel: string;
}) {
  const [etat, action, pending] = useActionState<Etat, FormData>(
    (prev, fd) => acceptInvitation(prev, fd),
    null,
  );

  if (etat?.success) {
    return (
      <div className="rounded-xl border border-ok bg-ok-soft p-6 text-center">
        <p className="font-semibold text-ok">Votre compte est créé.</p>
        <Link
          href="/auth/login"
          className="mt-4 inline-block rounded-full border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-ink-soft">
        Vous rejoignez <strong className="text-ink">{orgName}</strong> en tant que{" "}
        <strong className="text-ink">{roleLabel}</strong>.
      </p>
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Adresse e-mail
        </span>
        {/* Non modifiable : l'invitation vaut pour CETTE adresse, et c'est elle
            qui prouve que la personne a bien reçu le courriel. */}
        <input
          value={email}
          readOnly
          className="mt-1 w-full rounded-md border border-line-soft bg-clay px-3 py-2 font-mono text-sm text-ink-soft"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Votre nom
        </span>
        <input
          name="name"
          required
          autoComplete="name"
          className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Mot de passe
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <span className="mt-1 block text-xs text-ink-soft">Au moins 8 caractères.</span>
      </label>
      {etat?.error && (
        <p className="rounded-md bg-err-soft px-3 py-2 text-sm text-err">{etat.error}</p>
      )}
      <button
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Rejoindre le compte
      </button>
    </form>
  );
}
