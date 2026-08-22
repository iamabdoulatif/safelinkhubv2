"use client";

import { useActionState, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  FileText,
  MessageCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { markDocumentsSent, signAgreement } from "@/lib/kyc/actions";
import { MAX_KYC_ATTEMPTS } from "@/lib/kyc/constants";

export type Verification = {
  status: string;
  documentType: string | null;
  fullName: string | null;
  fullAddress: string | null;
  attempts: number;
  adminNote: string | null;
};

const ETAPES = [
  { cle: "documents", titre: "Pièces à fournir" },
  { cle: "agreement", titre: "Signature de l'accord" },
  { cle: "review", titre: "Examen du dossier" },
] as const;

/* L'étape ATTEINTE, déduite du statut. Un tableau d'états plutôt qu'une
   cascade de ternaires : ajouter un statut demain se voit ici, et nulle part
   ailleurs. */
const ETAPE_PAR_STATUT: Record<string, number> = {
  not_started: 0,
  documents_sent: 1,
  agreement_signed: 1,
  under_review: 2,
  approved: 3,
  rejected: 2,
};

const champ =
  "mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const etiquette = "block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft";

export default function VerificationCenter({
  verification,
  whatsappUrl,
  orgName,
}: {
  verification: Verification;
  whatsappUrl: string;
  orgName: string;
}) {
  const [state, action, pending] = useActionState(signAgreement, undefined);
  const [typePiece, setTypePiece] = useState(verification.documentType ?? "cni");
  const atteinte = ETAPE_PAR_STATUT[verification.status] ?? 0;
  const validee = verification.status === "approved";
  const refusee = verification.status === "rejected";
  const enExamen = verification.status === "under_review";
  const restantes = Math.max(0, MAX_KYC_ATTEMPTS - verification.attempts);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Vérification d&apos;identité</h1>
      </div>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
        Une organisation vérifiée peut encaisser sans plafond et débloque les demandes
        d&apos;autorisation accélérées. Comptez deux étapes.
      </p>

      {/* Fil des étapes — l'équivalent du bandeau numéroté du modèle. */}
      <ol className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border border-line bg-paper p-4" role="list">
        {ETAPES.map((etape, i) => {
          const faite = i < atteinte;
          const courante = i === atteinte;
          return (
            <li key={etape.cle} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  faite
                    ? "bg-brand text-slate-deep"
                    : courante
                      ? "border border-brand-deep text-brand-deep"
                      : "bg-clay text-ink-soft"
                }`}
              >
                {faite ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-sm ${courante ? "font-semibold text-ink" : "text-ink-soft"}`}>
                {etape.titre}
              </span>
              {i < ETAPES.length - 1 && (
                <span aria-hidden="true" className="mx-1 hidden h-px w-8 bg-line sm:block" />
              )}
            </li>
          );
        })}
      </ol>

      {validee && (
        <p className="mt-4 flex items-start gap-2 border-l-2 border-ok bg-clay px-4 py-3 text-sm text-ok">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{orgName}</strong> est vérifiée. Aucune action de votre part.
          </span>
        </p>
      )}
      {refusee && (
        <div className="mt-4 border-l-2 border-err bg-err-soft px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-err">
            <XCircle className="h-4 w-4" />
            Dossier refusé
          </p>
          {verification.adminNote && (
            <p className="mt-1 text-sm leading-6 text-ink">{verification.adminNote}</p>
          )}
          <p className="mt-1 text-xs text-ink-soft">
            {restantes > 0
              ? `Il vous reste ${restantes} tentative${restantes > 1 ? "s" : ""}.`
              : "Vous avez épuisé vos tentatives — contactez le support."}
          </p>
        </div>
      )}
      {enExamen && (
        <p className="mt-4 border-l-2 border-brand bg-clay px-4 py-3 text-sm text-ink">
          Dossier transmis. Nous revenons vers vous sous 48 h ouvrées.
        </p>
      )}

      {!validee && (
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* ── Étape 1 ─────────────────────────────────────────────── */}
          <section className="border border-line bg-paper p-5">
            <p className="font-mono text-xs font-bold text-brand-deep">01</p>
            <h2 className="mt-2 flex items-center gap-2 font-display text-lg font-bold text-ink">
              <FileText className="h-4 w-4 text-brand-deep" />
              Pièces à fournir
            </h2>
            <ul role="list" className="mt-3 space-y-1.5 text-sm leading-6 text-ink-soft">
              <li>• Une pièce d&apos;identité en cours de validité, recto et verso</li>
              <li>• Un justificatif de domicile de moins de trois mois</li>
            </ul>

            {/* Les pièces NE PASSENT PAS par le site : le seul stockage
                disponible écrit des URL publiques, ce qui exposerait des
                papiers d'identité à qui devinerait le lien. Elles transitent
                par le canal privé déjà utilisé pour les autorisations. */}
            <p className="mt-3 bg-clay px-3 py-2 text-xs leading-5 text-ink-soft">
              Vos pièces ne transitent pas par le site : envoyez-les sur le canal privé
              ci-dessous, elles ne sont jamais stockées sur une adresse publique.
            </p>

            <form action={markDocumentsSent} className="mt-4 space-y-3">
              <label className="block">
                <span className={etiquette}>Type de pièce</span>
                <select
                  name="documentType"
                  value={typePiece}
                  onChange={(e) => setTypePiece(e.target.value)}
                  className={champ}
                >
                  <option value="cni">Carte nationale d&apos;identité</option>
                  <option value="passeport">Passeport</option>
                  <option value="permis">Permis de conduire</option>
                </select>
              </label>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:bg-clay"
              >
                <MessageCircle className="h-4 w-4" />
                Envoyer mes pièces
              </a>
              <button
                type="submit"
                className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-deep-line"
              >
                {atteinte > 0 ? "Mettre à jour" : "J'ai envoyé mes pièces"}
              </button>
            </form>
          </section>

          {/* ── Étape 2 ─────────────────────────────────────────────── */}
          <section
            className={`border border-line bg-paper p-5 ${atteinte < 1 ? "opacity-55" : ""}`}
          >
            <p className="font-mono text-xs font-bold text-brand-deep">02</p>
            <h2 className="mt-2 font-display text-lg font-bold text-ink">
              Signature de l&apos;accord
            </h2>
            <div className="mt-3 max-h-40 overflow-y-auto border border-line-soft bg-clay p-3 text-xs leading-5 text-ink-soft">
              <p className="font-semibold text-ink">Déclaration de l&apos;opérateur</p>
              <p className="mt-2">
                Je certifie exploiter le réseau déclaré sous ma responsabilité, être titulaire
                des autorisations requises pour la revente d&apos;accès Internet dans mon pays
                d&apos;exercice, et que les pièces transmises sont authentiques.
              </p>
              <p className="mt-2">
                J&apos;autorise SafeLinkHub à conserver ces informations le temps de la
                relation commerciale et à les produire sur demande d&apos;une autorité
                compétente. Je peux en demander la suppression après clôture du compte.
              </p>
            </div>

            <form action={action} className="mt-3 space-y-3">
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" name="agreed" className="mt-1" disabled={atteinte < 1} />
                J&apos;accepte les conditions ci-dessus
              </label>
              <label className="block">
                <span className={etiquette}>Nom complet *</span>
                <input
                  name="fullName"
                  required
                  disabled={atteinte < 1}
                  defaultValue={verification.fullName ?? ""}
                  className={champ}
                />
              </label>
              <label className="block">
                <span className={etiquette}>Adresse complète *</span>
                <input
                  name="fullAddress"
                  required
                  disabled={atteinte < 1}
                  defaultValue={verification.fullAddress ?? ""}
                  className={champ}
                />
              </label>
              {state && "error" in state && state.error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
              )}
              <button
                type="submit"
                disabled={pending || atteinte < 1 || restantes === 0}
                className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-50"
              >
                {pending ? "Envoi…" : "Soumettre le dossier"}
              </button>
              <p className="text-xs text-ink-soft">
                {restantes} tentative{restantes > 1 ? "s" : ""} sur {MAX_KYC_ATTEMPTS}
              </p>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
