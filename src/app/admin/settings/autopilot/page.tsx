import type { ReactNode } from "react";
import { Bot } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { linkStatus } from "@/lib/autopilot/link";
import AutopilotLinkCard from "./AutopilotLinkCard";

/* SafeLink Auto-Pilot (app.safelinkhub.io) : liaison et tutoriels. SafeLinkHub
   reste le seul gestionnaire WireGuard ; Auto-Pilot ne colle jamais un second
   script WireGuard sur un routeur. */

function Etape({ n, titre, children }: { n: number; titre: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-slate-deep">
        {n}
      </span>
      <div className="pt-0.5">
        <p className="font-medium text-ink">{titre}</p>
        <div className="mt-0.5 text-sm leading-6 text-ink-soft">{children}</div>
      </div>
    </li>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="mt-2 block overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-clay px-3 py-2 font-mono text-xs text-ink">
    {children}
  </code>
);

function Carte({ titre, sousTitre, children }: { titre: string; sousTitre: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-paper p-6">
      <h2 className="font-semibold text-ink">{titre}</h2>
      <p className="mt-1 text-sm text-ink-soft">{sousTitre}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function AutopilotSettingsPage() {
  const session = await getSession();
  const link = session?.orgId ? await linkStatus(session.orgId).catch(() => null) : null;
  const linkView = link
    ? { linkedAt: link.linkedAt?.toISOString() ?? null, lastUsedAt: link.lastUsedAt?.toISOString() ?? null }
    : null;

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center border border-line bg-brand">
          <Bot className="h-5 w-5 text-slate-deep" />
        </span>
        <div>
          <h1 className="text-ink text-2xl font-semibold tracking-tight">SafeLink Auto-Pilot</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Supervision, diagnostic et rapports de ventes sur app.safelinkhub.io, avec vos routeurs déjà connectés ici.
          </p>
        </div>
      </div>

      <p className="mt-6 rounded-xl border border-line bg-clay px-4 py-3 text-xs leading-5 text-ink">
        <strong>Un seul tunnel WireGuard par routeur</strong>, toujours géré par SafeLinkHub. Auto-Pilot rejoint vos
        routeurs par ce tunnel : aucun second script WireGuard, donc ni conflit ni coupure d&apos;accès à distance.
      </p>

      <div className="mt-6 space-y-6">
        <AutopilotLinkCard status={linkView} />

        <Carte
          titre="Cas 1 — Votre routeur est déjà sur SafeLinkHub"
          sousTitre="Aucun script à coller : Auto-Pilot reconnaît vos routeurs et les ajoute tout seul."
        >
          <ol className="space-y-4">
            <Etape n={1} titre="Générer un code de liaison">
              Ci-dessus, <b>« Générer un code de liaison »</b>. Le code (8 caractères) est valable 10 minutes et ne sert
              qu&apos;une fois.
            </Etape>
            <Etape n={2} titre="Le saisir dans Auto-Pilot">
              Sur app.safelinkhub.io : <b>Tableau de bord → Ajouter un routeur</b>, collez le code puis <b>Lier</b>. Une
              seule fois par espace.
            </Etape>
            <Etape n={3} titre="Vos routeurs entrent dans le parc">
              Chaque routeur en ligne ici est ajouté au parc d&apos;Auto-Pilot. SafeLinkHub pose sur le routeur un
              compte de <b>lecture seule</b> pour Auto-Pilot (joignable uniquement par le tunnel), puis un premier
              relevé est fait.
            </Etape>
            <Etape n={4} titre="Ne garder que certains routeurs">
              Dans Auto-Pilot, supprimer un routeur du parc l&apos;exclut : il n&apos;est plus réimporté. Ici, rien ne
              change.
            </Etape>
          </ol>
          <p className="mt-4 text-sm text-ink-soft">
            Auto-Pilot ne reçoit que le nom, l&apos;adresse de tunnel et l&apos;adresse MikHmon de vos routeurs, jamais
            de mot de passe. <b>Révoquer la liaison</b> (ci-dessus) coupe son accès à la liste immédiatement.
          </p>
        </Carte>

        <Carte
          titre="Cas 2 — Utiliser Auto-Pilot sans compte SafeLinkHub"
          sousTitre="Pour un client qui n'utilise qu'Auto-Pilot : même ligne WireGuard à coller, compte SafeLinkHub inutile."
        >
          <ol className="space-y-4">
            <Etape n={1} titre="Dans Auto-Pilot : « Continuer sans compte SafeLinkHub »">
              <b>Ajouter un routeur → Continuer sans compte SafeLinkHub</b>. SafeLinkHub crée en coulisse une
              organisation technique propre à cet espace (aucun utilisateur, aucune adresse e-mail transmise).
            </Etape>
            <Etape n={2} titre="Générer et copier la ligne">
              Un nom (ex. HSPT-QUARTIER), puis <b>« Générer la ligne à coller »</b>. Valable 2 heures, usage unique.
            </Etape>
            <Etape n={3} titre="La coller dans le terminal MikroTik">
              Le routeur doit avoir Internet. <b>WinBox → New Terminal</b>, coller, <b>Entrée</b>. C&apos;est la même
              installation WireGuard que l&apos;ajout de routeur de SafeLinkHub.
            </Etape>
            <Etape n={4} titre="Ajout automatique">
              Le routeur apparaît dans le parc d&apos;Auto-Pilot en 1 à 3 minutes. Si le client crée plus tard un compte
              SafeLinkHub, ses routeurs restent sur le même tunnel.
            </Etape>
          </ol>
          <p className="mt-4 text-sm text-ink-soft">
            Si la ligne est collée sur un routeur qui porte déjà <b>safelinkhub-wg0</b>, elle n&apos;installe rien (le
            terminal l&apos;indique) : aucun routeur fantôme n&apos;est créé.
          </p>
        </Carte>

        <Carte titre="En cas de problème" sousTitre="Les cas rencontrés sur le parc et leur correctif.">
          <div className="space-y-5 text-sm">
            <div>
              <p className="font-medium text-ink">« not enough permissions » lors de l&apos;ajout dans Auto-Pilot</p>
              <p className="mt-1 text-ink-soft">
                Le compte SafeLinkHub du routeur vient d&apos;une ancienne installation, sans le droit de gérer les
                comptes. Dans le terminal du routeur :
              </p>
              <Code>/user group set [find name=safelinkhub-group] policy=api,read,write,policy,test,sensitive,ssh,ftp</Code>
            </div>
            <div>
              <p className="font-medium text-ink">Lecture REST impossible / WebFig à distance qui ne répond pas</p>
              <p className="mt-1 text-ink-soft">Le service web doit écouter sur le port 85 :</p>
              <Code>/ip service set [find name=www] port=85 disabled=no</Code>
            </div>
            <div>
              <p className="font-medium text-ink">Routeur absent du parc d&apos;Auto-Pilot</p>
              <p className="mt-1 text-ink-soft">
                Seuls les routeurs en ligne sont ajoutés ; un routeur hors ligne le sera à son retour. Un routeur retiré
                du parc dans Auto-Pilot n&apos;est plus réimporté.
              </p>
            </div>
            <div>
              <p className="font-medium text-ink">Ne jamais coller deux scripts WireGuard</p>
              <p className="mt-1 text-ink-soft">
                N&apos;utilisez que la ligne générée par SafeLinkHub ou par Auto-Pilot : elle détecte le tunnel
                existant. Un autre script créerait un second tunnel et couperait l&apos;accès à distance.
              </p>
            </div>
          </div>
        </Carte>
      </div>
    </div>
  );
}
