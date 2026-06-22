"use client";

import { useActionState } from "react";
import { connectRouter } from "@/lib/mikrotik/actions";

export default function ConnectRouterForm() {
  const [state, formAction, pending] = useActionState(connectRouter, undefined);

  if (state?.success) {
    return (
      <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Routeur connecté avec succès. Consultez les statistiques en direct
        sur le{" "}
        <a href="/admin/router" className="font-semibold underline">
          tableau de bord du routeur
        </a>
        .
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Nom du routeur
          </label>
          <input
            name="name"
            required
            placeholder="hAP ac lite"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Hôte / Adresse IP
          </label>
          <input
            name="host"
            required
            placeholder="192.168.88.1"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Port API
          </label>
          <input
            name="apiPort"
            type="number"
            defaultValue={8728}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Nom d'utilisateur
          </label>
          <input
            name="username"
            required
            placeholder="admin"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Mot de passe
          </label>
          <input
            name="password"
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Connexion..." : "Connecter le routeur"}
      </button>
    </form>
  );
}
