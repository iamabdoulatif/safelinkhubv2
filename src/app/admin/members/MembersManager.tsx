"use client";

import { useActionState, useState, useTransition } from "react";
import { Building2, Loader2, Mail, Shield, Trash2, UserPlus } from "lucide-react";
import { ROLES, roleLabel } from "@/lib/auth/roles";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  setMemberSites,
} from "@/lib/org/member-actions";
import type { Member, PendingInvitation } from "@/lib/org/members";

type SiteOption = { id: string; name: string };

type Etat = { error?: string; success?: true; sent?: boolean; link?: string } | null;

export default function MembersManager({
  membres,
  invitations,
  moiId,
  sites,
  sitesByMember,
}: {
  membres: Member[];
  invitations: PendingInvitation[];
  moiId: string;
  sites: SiteOption[];
  sitesByMember: Record<string, string[]>;
}) {
  // Sélection d'agences par membre, amorcée depuis la base et mise à jour à
  // chaque case cochée (post immédiat de setMemberSites).
  const [sitesSel, setSitesSel] = useState<Record<string, string[]>>(sitesByMember);
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

  function toggleSite(userId: string, siteId: string, checked: boolean) {
    const current = sitesSel[userId] ?? [];
    const next = checked ? [...current, siteId] : current.filter((id) => id !== siteId);
    setSitesSel((prev) => ({ ...prev, [userId]: next }));
    const fd = new FormData();
    fd.set("userId", userId);
    for (const id of next) fd.append("siteId", id);
    agir(setMemberSites, fd);
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
              className="field mt-1 w-full"
            />
          </label>
          <label className="sm:w-56">
            <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Rôle
            </span>
            <select
              name="role"
              defaultValue="editor"
              className="field mt-1 w-full"
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
            className="btn btn-md btn-primary inline-flex items-center justify-center gap-2"
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
          <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{etat.error}</p>
        )}
        {etat?.success && (
          <div className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
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
        <p className="flex items-start gap-2 border-b border-line-soft bg-clay/40 px-5 py-2.5 text-xs leading-5 text-ink-soft">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            « Agences » limite ce qu&apos;un membre <strong>voit</strong> du parc
            (listes, supervision). Sans agence cochée, il voit tout. Les
            administrateurs voient toujours tout.
          </span>
        </p>
        {/* Pas de `table-mobile-wrapper` ici : trois colonnes tiennent dans un
            téléphone. Le wrapper leur imposait 640 px de large et un
            défilement latéral pour rien — il cachait la colonne d'action. */}
        <div className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line-soft bg-clay text-xs uppercase tracking-wider text-ink-soft">
              <tr>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Personne</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Rôle</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Agences</th>
                <th className="px-4 py-2.5 text-right font-semibold sm:px-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {membres.map((m) => {
                const moi = m.id === moiId;
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-3 sm:px-5">
                      <p className="font-medium text-ink">
                        {m.name}
                        {moi && <span className="ml-2 text-xs text-ink-soft">(vous)</span>}
                      </p>
                      <p className="break-all font-mono text-xs text-ink-soft">{m.email}</p>
                    </td>
                    <td className="px-4 py-3 sm:px-5">
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
                          className="min-h-11 rounded-lg border border-line-soft bg-paper px-2 py-1 text-sm text-ink sm:min-h-0"
                        >
                          {ROLES.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      {m.role === "admin" || m.role === "superadmin" ? (
                        <span className="text-xs text-ink-soft">Toutes les agences</span>
                      ) : sites.length === 0 ? (
                        <span className="text-xs text-ink-soft">Aucune agence</span>
                      ) : (
                        <details>
                          <summary className="cursor-pointer list-none text-xs font-medium text-brand-deep">
                            {(sitesSel[m.id]?.length ?? 0) === 0
                              ? "Toutes les agences"
                              : `${sitesSel[m.id]!.length} agence${sitesSel[m.id]!.length > 1 ? "s" : ""}`}
                          </summary>
                          <ul className="mt-2 space-y-1" role="list">
                            {sites.map((s) => {
                              const checked = (sitesSel[m.id] ?? []).includes(s.id);
                              return (
                                <li key={s.id}>
                                  <label className="flex items-center gap-2 text-xs text-ink">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={busy}
                                      onChange={(e) => toggleSite(m.id, s.id, e.target.checked)}
                                    />
                                    {s.name}
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
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
                          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line-soft text-ink-soft transition hover:border-err hover:text-err disabled:opacity-50 sm:h-9 sm:w-9"
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
