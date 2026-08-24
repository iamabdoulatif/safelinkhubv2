"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Mail, Shield, Trash2, UserPlus } from "lucide-react";
import { ROLES, roleLabel } from "@/lib/auth/roles";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvitation,
} from "@/lib/org/member-actions";
import type { Member, PendingInvitation } from "@/lib/org/members";

type Etat = { error?: string; success?: true; sent?: boolean; link?: string } | null;

export default function MembersManager({
  membres,
  invitations,
  moiId,
}: {
  membres: Member[];
  invitations: PendingInvitation[];
  moiId: string;
}) {
  const [etat, inviter, invitePending] = useActionState<Etat, FormData>(
    (_prev, formData) => inviteMember(_prev, formData),
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
      {/* ── Inviter ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <UserPlus className="h-4 w-4 text-brand-deep" />
          Inviter une personne
        </h2>
        <form action={inviter} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Adresse e-mail
            </span>
            <input
              name="email"
              type="email"
              required
              placeholder="collegue@exemple.com"
              className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <label className="sm:w-56">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Rôle
            </span>
            <select
              name="role"
              defaultValue="editor"
              className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={invitePending}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60"
          >
            {invitePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Envoyer
          </button>
        </form>

        <ul className="mt-4 space-y-1.5 text-xs leading-5 text-ink-soft" role="list">
          {ROLES.map((r) => (
            <li key={r.id}>
              <strong className="text-ink">{r.label}</strong> — {r.description}
            </li>
          ))}
        </ul>

        {etat?.error && (
          <p className="mt-3 rounded-md bg-err-soft px-3 py-2 text-sm text-err">{etat.error}</p>
        )}
        {etat?.success && (
          <div className="mt-3 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
            Invitation créée.
            {/* Sans Resend configuré l'envoi échoue en silence : le lien reste
                affiché pour être transmis à la main, sinon l'invitation serait
                créée mais introuvable. */}
            {etat.sent ? " Un courriel vient de partir." : " L'envoi du courriel a échoué —"}
            {!etat.sent && etat.link && (
              <>
                {" "}transmettez ce lien vous-même :{" "}
                <code className="break-all font-mono text-xs text-ink">{etat.link}</code>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Membres ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-paper">
        <h2 className="flex items-center gap-2 border-b border-line-soft px-5 py-4 font-display text-lg font-bold text-ink">
          <Shield className="h-4 w-4 text-brand-deep" />
          Membres du compte
        </h2>
        <div className="table-mobile-wrapper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line-soft bg-clay text-xs uppercase tracking-wider text-ink-soft">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Personne</th>
                <th className="px-5 py-2.5 font-semibold">Rôle</th>
                <th className="px-5 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {membres.map((m) => {
                const moi = m.id === moiId;
                return (
                  <tr key={m.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">
                        {m.name}
                        {moi && <span className="ml-2 text-xs text-ink-soft">(vous)</span>}
                      </p>
                      <p className="font-mono text-xs text-ink-soft">{m.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      {moi || m.role === "superadmin" ? (
                        <span className="text-ink">{roleLabel(m.role)}</span>
                      ) : (
                        <select
                          defaultValue={m.role}
                          disabled={busy}
                          onChange={(e) => {
                            const fd = new FormData();
                            fd.set("userId", m.id);
                            fd.set("role", e.target.value);
                            agir(changeMemberRole, fd);
                          }}
                          className="rounded-md border border-line-soft bg-paper px-2 py-1 text-sm text-ink"
                        >
                          {ROLES.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!moi && m.role !== "superadmin" && (
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Retirer ${m.name}`}
                          onClick={() => {
                            if (!confirm(`Retirer ${m.name} du compte ?`)) return;
                            const fd = new FormData();
                            fd.set("userId", m.id);
                            agir(removeMember, fd);
                          }}
                          className="rounded-md border border-line-soft p-1.5 text-ink-soft transition hover:border-err hover:text-err disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

      {/* ── Invitations en attente ──────────────────────────────── */}
      {invitations.length > 0 && (
        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-display text-lg font-bold text-ink">Invitations en attente</h2>
          <ul className="mt-3 divide-y divide-line-soft" role="list">
            {invitations.map((i) => {
              const expiree = i.expired;
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-mono text-sm text-ink">{i.email}</span>
                    <span className="text-xs text-ink-soft">
                      {roleLabel(i.role)} ·{" "}
                      {expiree
                        ? "expirée"
                        : `valable jusqu'au ${i.expiresAt.toLocaleDateString("fr-FR")}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("id", i.id);
                      agir(revokeInvitation, fd);
                    }}
                    className="text-xs font-semibold text-err hover:underline disabled:opacity-50"
                  >
                    Annuler
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
