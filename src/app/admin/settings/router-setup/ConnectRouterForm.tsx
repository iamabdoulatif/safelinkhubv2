"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { connectRouter } from "@/lib/mikrotik/actions";
import FeatureAccessRequestModal from "@/components/billing/FeatureAccessRequestModal";
import type { FeatureAccessId } from "@/lib/billing/feature-access-config";
import LabelScanButton from "./LabelScanButton";
import type { MikrotikLabel } from "@/lib/mikrotik/label-parse";

type ConnectState =
  | { success?: boolean; error?: string; needsAuthorization?: FeatureAccessId }
  | undefined;

export default function ConnectRouterForm() {
  const [state0, formAction, pending] = useActionState(connectRouter, undefined);
  const state = state0 as ConnectState;
  const [gateDismissed, setGateDismissed] = useState(false);
  const locked = state?.needsAuthorization ?? null;

  // Champs pré-remplissables par le scan d'étiquette (contrôlés pour ça).
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [scanned, setScanned] = useState(false);

  function applyScan(label: MikrotikLabel) {
    if (label.model) setName(label.model);
    setUsername(label.username ?? "admin");
    if (label.password) setPassword(label.password);
    setScanned(true);
  }

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
        <div className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2.5 text-sm text-warn">
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
          <p className="rounded-md bg-err-soft px-3 py-2 text-sm text-err">{state.error}</p>
        )
      )}

      <LabelScanButton onResult={applyScan} />
      <p className="text-xs text-ink-soft">
        Astuce : scannez le guide/étiquette du MikroTik pour remplir automatiquement le nom,
        l&apos;utilisateur et le mot de passe par défaut.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-ink">
            Nom du routeur
          </label>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-line-soft focus:outline-none"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-ink">Mot de passe</label>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-xs font-medium text-ink-soft underline"
            >
              {showPassword ? "Masquer" : "Afficher"}
            </button>
          </div>
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>
      </div>

      {scanned && (
        <p className="rounded-md bg-clay px-3 py-2 text-sm text-ink-soft">
          Champs pré-remplis par le scan — <b className="text-ink">vérifiez le mot de passe</b>{" "}
          (l&apos;OCR peut confondre O/0, I/1) avant de connecter.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
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
