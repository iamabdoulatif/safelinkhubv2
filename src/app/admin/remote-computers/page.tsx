import { redirect } from "next/navigation";
import { Monitor, Apple, Terminal, ExternalLink, ShieldCheck } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";

// Console d’accès distant aux ordinateurs (MeshCentral auto-hébergé). Cette page
// est un LANCEUR + guide : la console gère sa propre authentification. Le SSO et
// la liste des appareils dans le SaaS viendront au jalon 2.
const CONSOLE_URL = process.env.MESHCENTRAL_URL || "https://remote.safelinkhub.io";

export default async function RemoteComputersPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-ink text-2xl font-semibold tracking-tight">Accès ordinateurs</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Prendre la main à distance sur un ordinateur (macOS, Linux, Windows) depuis le navigateur —
        un poste en pilote un autre. Propulsé par MeshCentral auto-hébergé.
      </p>

      <a
        href={CONSOLE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-slate-deep hover:opacity-90"
      >
        <Monitor className="h-4 w-4" />
        Ouvrir la console
        <ExternalLink className="h-4 w-4" />
      </a>

      <div className="mt-8 border border-line bg-paper p-5 rounded-xl">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Monitor className="h-4 w-4" /> Ajouter un ordinateur à piloter
        </h2>
        <ol className="mt-3 space-y-2 text-sm text-ink-soft">
          <li>
            1. Dans la console, créez un <b className="text-ink">groupe d’appareils</b> (« Add Device Group »).
          </li>
          <li>
            2. Téléchargez l’<b className="text-ink">agent</b> pour l’OS de la machine cible et installez-le
            <b className="text-ink"> sur cet ordinateur</b> (celui qu’on veut contrôler).
          </li>
          <li>
            3. L’ordinateur apparaît dans la console. Depuis n’importe quel navigateur, cliquez dessus →
            <b className="text-ink"> Desktop</b> pour prendre la main.
          </li>
        </ol>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line-soft bg-clay p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Apple className="h-4 w-4" /> macOS
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Agent .pkg depuis la console (clic droit → Ouvrir au 1er lancement s’il est bloqué).
              Autorisez « Enregistrement de l’écran » et « Accessibilité » dans Réglages › Confidentialité.
            </p>
          </div>
          <div className="rounded-xl border border-line-soft bg-clay p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Terminal className="h-4 w-4" /> Linux
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Commande d’installation en une ligne fournie par la console (bash). L’agent tourne en
              service et survit au redémarrage.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-paper p-4 text-xs text-ink-soft">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
        <p>
          Service sensible (contrôle total de machines) : activez la <b className="text-ink">2FA</b> sur
          votre compte, gardez un mot de passe fort, et n’installez l’agent que sur des ordinateurs qui
          vous appartiennent ou dont l’utilisateur a consenti. L’inscription publique est fermée.
        </p>
      </div>
    </div>
  );
}
