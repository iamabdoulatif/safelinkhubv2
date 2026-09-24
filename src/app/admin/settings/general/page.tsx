import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { ArrowRight, Check, Circle } from "lucide-react";
import { getCurrentOrganization } from "@/lib/organizations/actions";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { captiveTemplates, paymentGateways, routers, smsGateways } from "@/lib/db/schema";
import { SETTINGS_SECTIONS } from "../sections";
import CopyValue from "./CopyValue";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

const DESCRIPTIONS: Record<string, string> = {
  "/admin/settings/router-setup": "Topologie, bridges, VPN et auto-setup MikroTik.",
  "/admin/settings/payment-gateways": "Paystack, Genius Pay, PawaPay pour les ventes en ligne.",
  "/admin/settings/captive-templates": "La page de connexion hotspot de vos clients.",
  "/admin/settings/walled-garden": "Hôtes joignables depuis le portail avant connexion.",
  "/admin/settings/sms": "Envoi des codes et notifications par SMS.",
  "/admin/billing": "Formule, solde et factures de votre compte.",
  "/admin/settings/advanced": "Renommer ou supprimer définitivement l'organisation.",
};

/**
 * Page d'accueil des paramètres : QUI est l'organisation, puis CE QUI RESTE À
 * FAIRE pour vendre. L'écran précédent listait six cartes de liens sans dire
 * lesquelles étaient déjà réglées.
 */
export default async function GeneralSettingsPage() {
  const [org, session] = await Promise.all([getCurrentOrganization(), getSession()]);
  if (!org || !session) return null;

  const db = getDb();
  const compter = (p: Promise<{ n: number }[]>) => p.then((r) => r[0]?.n ?? 0).catch(() => 0);
  const [nbRouteurs, nbPaiements, nbSms, nbPortails] = await Promise.all([
    compter(db.select({ n: count() }).from(routers).where(eq(routers.orgId, org.id))),
    compter(
      db.select({ n: count() }).from(paymentGateways).where(and(eq(paymentGateways.orgId, org.id), eq(paymentGateways.enabled, true))),
    ),
    compter(db.select({ n: count() }).from(smsGateways).where(and(eq(smsGateways.orgId, org.id), eq(smsGateways.enabled, true)))),
    compter(db.select({ n: count() }).from(captiveTemplates).where(eq(captiveTemplates.orgId, org.id))),
  ]);

  // Ce qui fait tourner la vente, dans l'ordre où on le règle.
  const etapes = [
    {
      fait: nbRouteurs > 0,
      titre: "Lier un routeur MikroTik",
      detail: nbRouteurs > 0 ? `${nbRouteurs} routeur${nbRouteurs > 1 ? "s" : ""} lié${nbRouteurs > 1 ? "s" : ""}` : "Aucun routeur lié",
      href: "/admin/settings/router-setup",
    },
    {
      fait: nbPortails > 0,
      titre: "Personnaliser le portail captif",
      detail: nbPortails > 0 ? `${nbPortails} modèle${nbPortails > 1 ? "s" : ""} de portail` : "Portail par défaut",
      href: "/admin/settings/captive-templates",
    },
    {
      fait: nbPaiements > 0,
      titre: "Activer un paiement en ligne",
      detail: nbPaiements > 0 ? `${nbPaiements} passerelle${nbPaiements > 1 ? "s" : ""} active${nbPaiements > 1 ? "s" : ""}` : "Aucune passerelle active",
      href: "/admin/settings/payment-gateways",
    },
    {
      fait: nbSms > 0,
      titre: "Brancher l'envoi de SMS",
      detail: nbSms > 0 ? "Passerelle SMS active" : "Optionnel — codes envoyés par SMS",
      href: "/admin/settings/sms",
    },
  ];
  const faites = etapes.filter((e) => e.fait).length;
  const initiales =
    org.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Général</h1>
        <p className="mt-1 text-sm text-ink-soft">Votre organisation et l&apos;état de sa configuration.</p>
      </div>

      {/* Identité */}
      <section className="rounded-xl border border-line bg-paper">
        <div className="flex items-center gap-4 border-b border-line-soft p-5">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-deep text-base font-semibold text-white"
          >
            {initiales}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-ink">{org.name}</h2>
            <p className="text-[13px] text-ink-soft">Client depuis le {formatDate(org.createdAt)}</p>
          </div>
          <Link href="/admin/settings/advanced" className="btn btn-sm btn-outline shrink-0">
            Renommer
          </Link>
        </div>
        <dl className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-ink-soft">Identifiant de l&apos;organisation</dt>
            <dd className="mt-1">
              <CopyValue value={org.slug} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-soft">Type de compte</dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {org.accountType === "reseller" ? "Revendeur" : "Opérateur"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Configuration */}
      <section className="rounded-xl border border-line bg-paper">
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Configuration de votre espace</h2>
            <p className="text-[13px] text-ink-soft">
              {faites === etapes.length
                ? "Tout est en place pour vendre."
                : `${faites} sur ${etapes.length} — le reste se règle en quelques minutes.`}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Avancement de la configuration"
            aria-valuemin={0}
            aria-valuemax={etapes.length}
            aria-valuenow={faites}
            className="flex w-40 gap-1"
          >
            {etapes.map((e) => (
              <span key={e.titre} className={`h-1.5 flex-1 rounded-full ${e.fait ? "bg-ok" : "bg-line-soft"}`} />
            ))}
          </div>
        </div>
        <ul role="list" className="divide-y divide-line-soft border-t border-line-soft">
          {etapes.map((e) => (
            <li key={e.titre}>
              <Link href={e.href} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-clay/50">
                {e.fait ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok-soft">
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-ok" strokeWidth={3} />
                    <span className="sr-only">Fait</span>
                  </span>
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <Circle aria-hidden="true" className="h-5 w-5 text-line-strong" strokeDasharray="3 3" />
                    <span className="sr-only">À faire</span>
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${e.fait ? "text-ink-soft" : "text-ink"}`}>{e.titre}</span>
                  <span className="block text-xs text-ink-soft">{e.detail}</span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Toutes les sections */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Toutes les sections</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SETTINGS_SECTIONS.filter((s) => s.href !== "/admin/settings/general").map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-3 rounded-xl border border-line bg-paper p-4 transition-colors hover:border-line-strong/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-clay text-ink-soft group-hover:text-brand-deep">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{label}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{DESCRIPTIONS[href]}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
