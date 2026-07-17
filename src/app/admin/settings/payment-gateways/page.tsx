import { CreditCard } from "lucide-react";
import { listPaymentGateways } from "@/lib/payment-gateways/actions";
import { PROVIDERS } from "@/lib/payment-gateways/providers";
import GatewayCard from "./GatewayCard";
import ChannelPicker from "./ChannelPicker";

export default async function PaymentGatewaysPage() {
  const gateways = await listPaymentGateways();
  const byProvider = new Map(gateways.map((g) => [g.provider, g]));
  const enabledProviders = PROVIDERS.filter((p) => byProvider.get(p)?.enabled);

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center border-2 border-line bg-brand"
        >
          <CreditCard className="h-5 w-5 text-[#1C1917]" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Paiements
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Canaux de collecte et comptes marchands de votre organisation.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ChannelPicker enabledProviders={enabledProviders} />
      </div>

      <h2 className="mt-8 font-display text-lg font-bold text-ink">Passerelles marchandes</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Paystack, Genius Pay et PawaPay sont des agrégateurs : chacun couvre déjà
        Wave, Orange Money, Moov Money, MTN MoMo et carte bancaire en interne —
        inutile de configurer ces canaux séparément.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PROVIDERS.map((provider) => {
          const g = byProvider.get(provider);
          return (
            <GatewayCard
              key={provider}
              provider={provider}
              merchantId={g?.merchantId ?? null}
              enabled={g?.enabled ?? false}
              hasApiKey={g?.hasApiKey ?? false}
            />
          );
        })}
      </div>

      <p className="mt-6 border-2 border-line bg-clay px-4 py-3 text-xs leading-5 text-ink">
        Les clés sont chiffrées au repos. <strong>Genius Pay</strong> est branché
        au portail captif : une fois activé avec vos clés, l&apos;achat d&apos;un
        forfait déclenche un vrai paiement, puis le code d&apos;accès est créé sur
        le routeur et envoyé par SMS. Paystack et PawaPay restent des maquettes
        d&apos;interface (aucun débit) tant que leurs API ne sont pas branchées.
      </p>
    </div>
  );
}
