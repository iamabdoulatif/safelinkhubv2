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
const RELEASE = "https://github.com/iamabdoulatif/safelinkhubv2/releases/download/agent-latest";

const DOWNLOADS = [
  {
    os: "mac-arm",
    title: "macOS — Apple Silicon",
    detail: "Mac M1, M2, M3, M4 (depuis fin 2020)",
    file: "SafeLinkHub-Agent-macOS-arm64.dmg",
    size: "44 Mo",
    Icon: Apple,
  },
  {
    os: "mac-intel",
    title: "macOS — Intel",
    detail: "Mac avec processeur Intel (avant 2021)",
    file: "SafeLinkHub-Agent-macOS-x64.dmg",
    size: "44 Mo",
    Icon: Laptop,
  },
  {
    os: "windows",
    title: "Windows",
    detail: "Windows 10 / 11, 64 bits",
    file: "SafeLinkHub-Agent-Setup.exe",
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
              href={`${RELEASE}/${file}`}
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

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-base font-semibold text-ink">Installer sur macOS</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            <li>Ouvrez le fichier .dmg, glissez <b>SafeLinkHub Agent</b> dans <b>Applications</b>.</li>
            <li>Lancez-le depuis Applications. macOS le bloque la première fois (application non notarisée).</li>
            <li>
              Ouvrez <b>Réglages Système › Confidentialité et sécurité</b>, cliquez sur{" "}
              <b>« Ouvrir quand même »</b>, puis confirmez avec le mot de passe du Mac.
            </li>
            <li>L&apos;agent ouvre votre navigateur. Fermez l&apos;application pour l&apos;arrêter.</li>
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
