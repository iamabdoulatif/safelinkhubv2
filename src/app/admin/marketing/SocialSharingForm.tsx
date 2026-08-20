"use client";

import { useActionState } from "react";
import { updateSocialSharing } from "@/lib/social/actions";

const field =
  "w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand";
const label = "mb-1.5 block text-sm font-medium text-ink";

export default function SocialSharingForm({
  telegramChatId,
  facebookPageId,
  hasTelegramToken,
  hasFacebookToken,
}: {
  telegramChatId: string | null;
  facebookPageId: string | null;
  /** On n'envoie JAMAIS le jeton au navigateur — seulement sa présence. */
  hasTelegramToken: boolean;
  hasFacebookToken: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateSocialSharing, undefined);

  return (
    <form action={formAction} className="max-w-3xl rounded-xl border border-line bg-paper p-6">
      <h2 className="text-sm font-semibold text-ink">Diffusion des articles de blog</h2>
      <p className="mt-1 text-sm text-ink-soft">
        À la publication d&apos;un article, SafeLinkHub poste automatiquement sur
        les canaux renseignés ici.
      </p>

      {state && "error" in state && (
        <p className="mt-4 rounded-lg border border-err bg-err-soft px-3 py-2 text-sm font-semibold text-err">
          {state.error}
        </p>
      )}
      {state && "success" in state && (
        <p className="mt-4 rounded-lg border border-ok bg-ok/10 px-3 py-2 text-sm font-semibold text-ok">
          Réglages enregistrés.
        </p>
      )}

      <div className="mt-6 space-y-6">
        <fieldset className="rounded-xl border border-line bg-clay p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Telegram</legend>
          <p className="mb-3 text-xs text-ink-soft">
            Créez un bot avec @BotFather, puis <strong>ajoutez-le comme
            administrateur</strong> du groupe ou du canal — sans ce droit, l&apos;envoi
            est refusé.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tg-chat" className={label}>Identifiant du salon</label>
              <input
                id="tg-chat"
                name="telegramChatId"
                defaultValue={telegramChatId ?? ""}
                placeholder="@safelinkhub ou -1001234567890"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="tg-token" className={label}>
                Jeton du bot{" "}
                <span className="font-normal text-ink-soft">
                  {hasTelegramToken ? "— enregistré" : "— non renseigné"}
                </span>
              </label>
              <input
                id="tg-token"
                name="telegramBotToken"
                type="password"
                autoComplete="off"
                placeholder={hasTelegramToken ? "Laisser vide pour conserver" : "123456:AA…"}
                className={field}
              />
              {hasTelegramToken && (
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                  <input type="checkbox" name="clearTelegramToken" className="h-4 w-4 accent-slate-deep" />
                  Effacer le jeton enregistré
                </label>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-line bg-clay p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Page Facebook</legend>
          <p className="mb-3 text-xs text-ink-soft">
            Jeton d&apos;accès <strong>de page</strong> (pas d&apos;utilisateur), longue
            durée, portant la permission <code className="font-mono">pages_manage_posts</code>.
            Ces jetons expirent&nbsp;: en cas d&apos;échec, l&apos;éditeur affiche le
            message exact renvoyé par Meta.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fb-page" className={label}>Identifiant de la page</label>
              <input
                id="fb-page"
                name="facebookPageId"
                defaultValue={facebookPageId ?? ""}
                placeholder="546349135390552"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="fb-token" className={label}>
                Jeton de page{" "}
                <span className="font-normal text-ink-soft">
                  {hasFacebookToken ? "— enregistré" : "— non renseigné"}
                </span>
              </label>
              <input
                id="fb-token"
                name="facebookPageToken"
                type="password"
                autoComplete="off"
                placeholder={hasFacebookToken ? "Laisser vide pour conserver" : "EAAG…"}
                className={field}
              />
              {hasFacebookToken && (
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                  <input type="checkbox" name="clearFacebookToken" className="h-4 w-4 accent-slate-deep" />
                  Effacer le jeton enregistré
                </label>
              )}
            </div>
          </div>
        </fieldset>

        <p className="text-xs text-ink-soft">
          <strong>WhatsApp n&apos;est pas proposé.</strong> L&apos;API Groupes de Meta
          plafonne un groupe à 8 participants et exige un compte Official Business
          Account&nbsp;: inutilisable pour un groupe communautaire. La diffusion
          WhatsApp reste manuelle.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer la diffusion"}
      </button>
    </form>
  );
}
