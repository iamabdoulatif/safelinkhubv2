import { CreditCard } from "lucide-react";
import { listPaymentGateways } from "@/lib/payment-gateways/actions";
import { PROVIDERS } from "@/lib/payment-gateways/providers";
import GatewayCard from "./GatewayCard";

export default async function PaymentGatewaysPage() {
  const gateways = await listPaymentGateways();
  const byProvider = new Map(gateways.map((g) => [g.provider, g]));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">
          Passerelles de paiement
        </h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Connectez vos comptes marchands. Paystack, Genius Pay et Wassoya sont
        des agrégateurs : chacun couvre déjà Wave, Orange Money, Moov Money,
        MTN MoMo et carte bancaire en interne — inutile de configurer ces
        canaux séparément.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

      <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-700">
        Les clés sont chiffrées au repos. Le bouton de paiement affiché sur le
        portail captif (voir Modèles de portail captif) est pour l&apos;instant
        une maquette d&apos;interface — aucun débit réel n&apos;est encore
        déclenché tant que l&apos;appel aux API Paystack / Genius Pay / Wassoya
        n&apos;est pas branché.
      </p>
    </div>
  );
}
