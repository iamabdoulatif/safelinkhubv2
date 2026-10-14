import { headers } from "next/headers";
import { Apple, Download, Laptop, MonitorDown, ShieldCheck, Usb } from "lucide-react";

/* Télécharger l'agent local.
 *
 * L'agent prépare et dépanne un MikroTik depuis le réseau LOCAL du client —
 * routeur neuf (192.168.88.1), sans Internet ni tunnel, donc hors de portée du
 * SaaS. Les installables sont construits par .github/workflows/agent-installers.yml
 * et publiés dans la release GitHub « agent-latest » (dépôt public).
 *
 * Non signés (pas de compte Apple / certificat Windows) : la page explique le
 * premier lancement, sans quoi l'avertissement du système fait croire à un virus.
 */
// Téléchargements servis par le SaaS (voir src/app/download/agent/[file]/route.ts),
// qui relaie la release GitHub « agent-latest ».
const DL = "/download/agent";

const DOWNLOADS = [
  {
    os: "mac-arm",
    title: "macOS — Apple Silicon",
    detail: "Mac M1, M2, M3, M4 (depuis fin 2020)",
    file: "macos-arm64.dmg",
    size: "44 Mo",
    Icon: Apple,
  },
  {
    os: "mac-intel",
    title: "macOS — Intel",
    detail: "Mac avec processeur Intel (avant 2021)",
    file: "macos-x64.dmg",
    size: "44 Mo",
    Icon: Laptop,
  },
  {
    os: "windows",
    title: "Windows",
    detail: "Windows 10 / 11, 64 bits",
    file: "windows-setup.exe",
    size: "23 Mo",
    Icon: MonitorDown,
  },
] as const;

/* Système de l'opérateur, deviné sur l'en-tête User-Agent : seulement pour
   mettre UN fichier en avant. Un Mac Apple Silicon se déclare encore « Intel »
   dans Safari/Chrome : on recommande donc Apple Silicon à tout Mac récent, et
   la carte Intel reste visible juste à côté. */
function guessOs(ua: string): (typeof DOWNLOADS)[number]["os"] | null {
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac-arm";
  return null;
}

export default async function AgentLocalPage() {
  const recommended = guessOs((await headers()).get("user-agent") ?? "");

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <Usb className="h-5 w-5 text-ink" />
        <h1 className="text-ink text-2xl font-semibold tracking-tight">Agent local</h1>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        Préparez et dépannez un MikroTik depuis votre ordinateur, branché sur le routeur : mise à
        jour RouterOS et firmware, paquets, mode avancé, diagnostic des tickets, revenus MikHmon,
        Wi-Fi et ports. Idéal pour un routeur neuf, sans Internet ni tunnel.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {DOWNLOADS.map(({ os, title, detail, file, size, Icon }) => {
          const isRecommended = os === recommended;
          return (
            <a
              key={os}
              href={`${DL}/${file}`}
              className={`group flex flex-col rounded-2xl border p-5 transition-colors ${
                isRecommended
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-ink hover:border-ink-soft"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-6 w-6" />
                {isRecommended && (
                  <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-ink">
                    Recommandé pour vous
                  </span>
                )}
              </div>
              <span className="mt-4 text-lg font-semibold">{title}</span>
              <span className={`text-sm ${isRecommended ? "text-white/70" : "text-ink-soft"}`}>{detail}</span>
              <span
                className={`mt-5 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold ${
                  isRecommended ? "bg-brand text-ink" : "border border-line group-hover:bg-clay"
                }`}
              >
                <Download className="h-4 w-4" />
                Télécharger · {size}
              </span>
            </a>
          );
        })}
      </div>

      <section className="mt-8 rounded-2xl border border-ink bg-ink p-5 text-white">
        <h2 className="text-base font-semibold">Installer sur macOS — méthode recommandée</h2>
        <p className="mt-2 text-sm text-white/70">
          macOS bloque les applications non signées par un compte Apple payant (message «
          l&apos;application ne répond pas »). Cette commande installe l&apos;agent et lève ce
          blocage. Ouvrez le <b>Terminal</b> (Applications › Utilitaires), collez la ligne, puis
          Entrée :
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-[13px] leading-6 text-brand">
          <code>curl -fsSL https://safelinkhub.io/download/agent/install-macos.sh | bash</code>
        </pre>
        <p className="mt-2 text-xs text-white/60">
          Elle détecte votre Mac (Apple Silicon ou Intel), installe l&apos;agent dans Applications et
          le lance. Rien d&apos;autre à faire.
        </p>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-base font-semibold text-ink">macOS — à partir du .dmg</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            <li>Ouvrez le .dmg, glissez <b>SafeLinkHub Agent</b> dans <b>Applications</b> — ne l&apos;ouvrez pas depuis le .dmg.</li>
            <li>
              S&apos;il refuse de s&apos;ouvrir, levez le blocage dans le Terminal :
              <code className="mt-1 block overflow-x-auto rounded bg-clay px-2 py-1 text-xs text-ink">xattr -dr com.apple.quarantine &quot;/Applications/SafeLinkHub Agent.app&quot;</code>
            </li>
            <li>Rouvrez-le depuis Applications. Il ouvre votre navigateur ; fermez-le pour l&apos;arrêter.</li>
          </ol>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-base font-semibold text-ink">Installer sur Windows</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            <li>Lancez <b>SafeLinkHub-Agent-Setup.exe</b> (aucun droit administrateur requis).</li>
            <li>
              Si SmartScreen affiche « Windows a protégé votre ordinateur » : <b>Informations
              complémentaires › Exécuter quand même</b>.
            </li>
            <li>L&apos;agent démarre et ouvre votre navigateur ; il est aussi dans le menu Démarrer.</li>
            <li>Fermez la fenêtre noire de l&apos;agent pour l&apos;arrêter.</li>
          </ol>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-base font-semibold text-ink">Avant de vous connecter au routeur</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
          <li>
            Branchez l&apos;ordinateur sur un <b>port LAN</b> du MikroTik (ether2 à ether5) ou rejoignez son
            Wi-Fi — pas le port Internet/WAN. Un routeur d&apos;usine répond sur <b>192.168.88.1</b>.
          </li>
          <li>Utilisez le compte <b>RouterOS (Winbox)</b> — mot de passe de l&apos;étiquette sur un routeur neuf —, pas un compte du portail captif.</li>
          <li>L&apos;agent chiffre ensuite la connexion tout seul (certificat créé sur le routeur, port 8729).</li>
        </ul>
        <p className="mt-4 flex items-start gap-2 text-xs text-ink-soft">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
          L&apos;agent n&apos;écoute que sur votre ordinateur (127.0.0.1) et ne stocke jamais vos identifiants sur le disque.
        </p>
      </section>
    </div>
  );
}
