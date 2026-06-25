import { MessageSquare } from "lucide-react";
import { listSmsGateways } from "@/lib/sms/actions";
import { PROVIDERS } from "@/lib/sms/providers";
import SmsGatewayCard from "./SmsGatewayCard";

export default async function SmsSettingsPage() {
  const gateways = await listSmsGateways();
  const byProvider = new Map(gateways.map((g) => [g.provider, g]));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-slate-700" />
        <h1 className="text-2xl font-bold text-slate-900">SMS</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Connectez une passerelle SMS pour envoyer automatiquement les codes voucher,
        rappels d&apos;expiration et alertes aux clients et agents.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

      <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-700">
        Les clés sont chiffrées au repos. L&apos;envoi effectif de SMS (codes voucher,
        rappels) n&apos;est pas encore branché à ces identifiants — pour l&apos;instant
        cette page enregistre les identifiants de connexion seulement, aucun SMS
        n&apos;est envoyé tant que l&apos;appel aux API Africa&apos;s Talking / Twilio
        n&apos;est pas implémenté.
      </p>
    </div>
  );
}
