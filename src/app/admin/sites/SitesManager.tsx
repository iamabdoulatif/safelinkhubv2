"use client";

import { useActionState, useState, useTransition } from "react";
import { Building2, Loader2, Plus, Router as RouterIcon, Trash2 } from "lucide-react";
import {
  assignRouterToSite,
  createSite,
  deleteSite,
  setSiteActive,
} from "@/lib/org/site-actions";
import type { AssignableRouter, Site } from "@/lib/org/sites";

type Etat = { error?: string; success?: true } | null;

export default function SitesManager({
  sites,
  routeurs,
}: {
  sites: Site[];
  routeurs: AssignableRouter[];
}) {
  const [etat, creer, creationPending] = useActionState<Etat, FormData>(
    (_prev, formData) => createSite(_prev, formData),
    null,
  );
  const [msg, setMsg] = useState<{ ok: boolean; texte: string } | null>(null);
  const [busy, start] = useTransition();

  function agir(action: (fd: FormData) => Promise<{ error?: string } | void>, fd: FormData) {
    setMsg(null);
    start(async () => {
      const res = await action(fd);
      if (res && "error" in res && res.error) setMsg({ ok: false, texte: res.error });
    });
  }

  return (
    <div className="mt-6 space-y-6">
      {/* ── Créer un site ───────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <Plus className="h-4 w-4 text-brand-deep" />
          Nouveau site
        </h2>
        <form action={creer} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Nom du site
            </span>
            <input
              name="name"
              required
              placeholder="Agence Plateau"
              className="field mt-1 w-full"
            />
          </label>
          <label className="sm:w-48">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Code (optionnel)
            </span>
            <input name="code" placeholder="auto" className="field mt-1 w-full" />
          </label>
          <button
            disabled={creationPending}
            className="btn btn-md btn-primary inline-flex items-center justify-center gap-2"
          >
            {creationPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Créer
          </button>
        </form>
        {etat?.error && (
          <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{etat.error}</p>
        )}
        {etat?.success && (
          <p className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">Site créé.</p>
        )}
      </section>

      {/* ── Sites existants ─────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-paper">
        <h2 className="flex items-center gap-2 border-b border-line-soft px-5 py-4 font-display text-lg font-bold text-ink">
          <Building2 className="h-4 w-4 text-brand-deep" />
          Sites du compte
        </h2>
        {sites.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-soft">
            Aucun site pour l&apos;instant. Créez votre première agence ci-dessus.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft" role="list">
            {sites.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {s.name}
                    {!s.active && <span className="ml-2 text-xs text-ink-soft">(inactif)</span>}
                  </span>
                  <span className="font-mono text-xs text-ink-soft">
                    {s.code} · {s.routerCount} routeur{s.routerCount > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("siteId", s.id);
                      fd.set("active", String(!s.active));
                      agir(setSiteActive, fd);
                    }}
                    className="text-xs font-semibold text-brand-deep hover:underline disabled:opacity-50"
                  >
                    {s.active ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Supprimer ${s.name}`}
                    onClick={() => {
                      if (
                        !confirm(
                          `Supprimer le site « ${s.name} » ? Ses routeurs repasseront « non rangés ».`,
                        )
                      )
                        return;
                      const fd = new FormData();
                      fd.set("siteId", s.id);
                      agir(deleteSite, fd);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line-soft text-ink-soft transition hover:border-err hover:text-err disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Affectation des routeurs ────────────────────────────── */}
      <section className="rounded-xl border border-line bg-paper">
        <h2 className="flex items-center gap-2 border-b border-line-soft px-5 py-4 font-display text-lg font-bold text-ink">
          <RouterIcon className="h-4 w-4 text-brand-deep" />
          Affectation des routeurs
        </h2>
        {routeurs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-soft">Aucun routeur lié à ce compte.</p>
        ) : (
          <ul className="divide-y divide-line-soft" role="list">
            {routeurs.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{r.name}</span>
                  <span className="text-xs text-ink-soft">{r.status}</span>
                </span>
                <select
                  defaultValue={r.siteId ?? ""}
                  disabled={busy || sites.length === 0}
                  onChange={(e) => {
                    const fd = new FormData();
                    fd.set("routerId", r.id);
                    fd.set("siteId", e.target.value);
                    agir(assignRouterToSite, fd);
                  }}
                  className="min-h-11 rounded-lg border border-line-soft bg-paper px-2 py-1 text-sm text-ink sm:min-h-0"
                >
                  <option value="">Non rangé</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        {msg && (
          <p
            className={`border-t px-5 py-3 text-sm ${
              msg.ok ? "border-ok bg-ok-soft text-ok" : "border-err bg-err-soft text-err"
            }`}
          >
            {msg.texte}
          </p>
        )}
      </section>
    </div>
  );
}
