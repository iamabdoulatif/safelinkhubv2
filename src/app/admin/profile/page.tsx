import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Building2, KeyRound, MessageCircle, Send, Shield, User as UserIcon } from "lucide-react";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { findCountry } from "@/lib/intl/countries";
import ProfileNameForm from "./ProfileNameForm";
import ChangePasswordForm from "./ChangePasswordForm";
import MfaSection from "./MfaSection";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function RoleBadge({ superadmin }: { superadmin: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        superadmin ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      <Shield className="h-3 w-3" />
      {superadmin ? "Superadmin" : "Admin"}
    </span>
  );
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/auth/login?callback=/admin/profile");

  const db = getDb();
  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      mfaEnabled: users.mfaEnabled,
      country: users.country,
      phoneDialCode: users.phoneDialCode,
      phone: users.phone,
      whatsapp: users.whatsapp,
      telegram: users.telegram,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const [org] = await db
    .select({ name: organizations.name, createdAt: organizations.createdAt })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  if (!user) redirect("/auth/login?callback=/admin/profile");

  const superadmin = isSuperAdmin(user.role);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <UserIcon className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">Mon profil</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Vos informations de compte sur SafeLinkHub.
      </p>

      <div className="mt-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-white">
          {user.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-semibold text-slate-900">{user.name}</p>
            <RoleBadge superadmin={superadmin} />
          </div>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
        </div>
      </div>

      <div id="organisation" className="mt-4 scroll-mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Organisation</h2>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">Nom</dt>
            <dd className="mt-0.5 font-medium text-slate-700">{org?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Client depuis</dt>
            <dd className="mt-0.5 font-medium text-slate-700">
              {org ? formatDate(org.createdAt) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Membre depuis</dt>
            <dd className="mt-0.5 font-medium text-slate-700">{formatDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Rôle</dt>
            <dd className="mt-0.5">
              <RoleBadge superadmin={superadmin} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-700">Informations personnelles</h2>
        <div className="mt-3">
          <ProfileNameForm currentName={user.name} />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-700">Contact</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">Pays de résidence</dt>
            <dd className="mt-0.5 font-medium text-slate-700">
              {user.country ? findCountry(user.country)?.name ?? user.country : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Téléphone</dt>
            <dd className="mt-0.5 font-medium text-slate-700">
              {user.phone ? `${user.phoneDialCode ?? ""} ${user.phone}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-slate-400">
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </dt>
            <dd className="mt-0.5 font-medium text-slate-700">
              {user.whatsapp ?? (user.phone ? `${user.phoneDialCode ?? ""} ${user.phone}` : "—")}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-slate-400">
              <Send className="h-3 w-3" /> Telegram
            </dt>
            <dd className="mt-0.5 font-medium text-slate-700">
              {user.telegram ?? (user.phone ? `${user.phoneDialCode ?? ""} ${user.phone}` : "—")}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Sécurité</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Changez votre mot de passe régulièrement pour protéger votre compte.
        </p>
        <div className="mt-3">
          <ChangePasswordForm />
        </div>

        <hr className="my-5 border-slate-100" />

        <h2 className="text-sm font-semibold text-slate-700">Double authentification (MFA)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Exige un code temporaire en plus du mot de passe à la connexion. Fortement recommandé
          pour les comptes superadmin.
        </p>
        <div className="mt-3">
          <MfaSection mfaEnabled={user.mfaEnabled} />
        </div>
      </div>
    </div>
  );
}
