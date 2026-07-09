import { MessageSquare } from "lucide-react";
import { listSmsGateways } from "@/lib/sms/actions";
import { PROVIDERS } from "@/lib/sms/providers";
import SmsGatewayCard from "./SmsGatewayCard";

export default async function SmsSettingsPage() {
  const gateways = await listSmsGateways();
  const byProvider = new Map(gateways.map((g) => [g.provider, g]));

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">SMS</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Connectez une passerelle SMS pour envoyer automatiquement les codes voucher,
        rappels d&apos;expiration et alertes aux clients et agents.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:max-w-sm">
        {PROVIDERS.map((provider) => {
          const g = byProvider.get(provider);
          return (
            <SmsGatewayCard
              key={provider}
              provider={provider}
              senderId={g?.senderId ?? null}
              enabled={g?.enabled ?? false}
              hasApiKey={g?.hasApiKey ?? false}
            />
          );
        })}
      </div>

      <p className="mt-6 rounded-md bg-clay px-4 py-3 text-xs text-ink-soft">
        Les clés sont chiffrées au repos. Une fois la passerelle activée et la clé
        enregistrée, utilisez le bouton « Tester » pour envoyer un vrai SMS via
        l&apos;API Wassoya et vérifier vos identifiants.
      </p>
    </div>
  );
}
