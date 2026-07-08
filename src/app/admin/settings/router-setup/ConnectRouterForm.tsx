"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { connectRouter } from "@/lib/mikrotik/actions";
import FeatureAccessRequestModal from "@/components/billing/FeatureAccessRequestModal";
import type { FeatureAccessId } from "@/lib/billing/feature-access-config";

type ConnectState =
  | { success?: boolean; error?: string; needsAuthorization?: FeatureAccessId }
  | undefined;

export default function ConnectRouterForm() {
  const [state0, formAction, pending] = useActionState(connectRouter, undefined);
  const state = state0 as ConnectState;
  const [gateDismissed, setGateDismissed] = useState(false);
  const locked = state?.needsAuthorization ?? null;

  if (state?.success) {
    return (
      <div className="rounded-md bg-clay px-4 py-3 text-sm text-ok">
        Routeur connecté avec succès. Consultez les statistiques en direct
        sur le{" "}
        <Link href="/admin/router" className="font-semibold underline">
          tableau de bord du routeur
        </Link>
        .
      </div>
    );
  }

  return (
    <>
    <form action={formAction} className="space-y-4">
      {locked ? (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Fonctionnalité verrouillée</p>
            <p className="mt-0.5">
              Lier un MikroTik nécessite l&apos;autorisation de l&apos;administrateur.{" "}
              <button
                type="button"
                onClick={() => setGateDismissed(false)}
                className="font-semibold underline"
              >
                Demander l&apos;accès
              </button>
              .
            </p>
          </div>
        </div>
      ) : (
        state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
        )
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-ink">
            Nom du routeur
          </label>
          <input
            name="name"
            required
            placeholder="hAP ac lite"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-line-soft focus:outline-none"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="mb-1 block text-sm font-medium text-ink">
            Hôte / Adresse IP
          </label>
          <input
            name="host"
            required
            placeholder="192.168.88.1"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            Port API
          </label>
          <input
            name="apiPort"
            type="number"
            defaultValue={8728}
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            Nom d&apos;utilisateur
          </label>
          <input
            name="username"
            required
            placeholder="admin"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            Mot de passe
          </label>
          <input
            name="password"
            type="password"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
      >
        {pending ? "Connexion..." : "Connecter le routeur"}
      </button>
    </form>
    {locked && (
      <FeatureAccessRequestModal
        open={!gateDismissed}
        onClose={() => setGateDismissed(true)}
        feature={locked}
      />
    )}
    </>
  );
}
