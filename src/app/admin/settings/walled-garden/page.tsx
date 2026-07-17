import { ShieldCheck } from "lucide-react";
import { getWalledGardenSelection } from "./actions";
import WalledGardenManager from "./WalledGardenManager";

export default async function WalledGardenPage() {
  const { disabledHosts } = await getWalledGardenSelection();

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center border-2 border-line bg-brand"
        >
          <ShieldCheck className="h-5 w-5 text-[#1C1917]" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Walled-garden
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Choisissez les hôtes de paiement joignables depuis le portail captif
            avant connexion.
          </p>
        </div>
      </div>

      <p className="mt-6 border-2 border-line bg-clay px-4 py-3 text-xs leading-5 text-ink">
        Chaque hôte coché est autorisé sur le hotspot pour un client{" "}
        <strong>non authentifié</strong> (le checkout doit pouvoir se charger avant
        le paiement). L&apos;app SafeLinkHub est toujours installée et n&apos;apparaît
        pas ici. Les changements s&apos;appliquent à la <strong>prochaine
        installation</strong> : bootstrap d&apos;un routeur, synchronisation
        automatique (routeurs déjà en service) ou (ré)assignation d&apos;un portail.
      </p>

      <div className="mt-6">
        <WalledGardenManager initialDisabled={disabledHosts} />
      </div>
    </div>
  );
}
