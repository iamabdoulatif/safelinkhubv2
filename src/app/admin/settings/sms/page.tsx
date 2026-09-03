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

      {/* Ce que « Activée » change VRAIMENT, écrit noir sur blanc : sans cette
          phrase, décocher la case ressemble à une panne, alors que c'est un
          mode de vente à part entière. */}
      <div className="mt-6 space-y-3 rounded-md bg-clay px-4 py-3 text-xs leading-5 text-ink-soft">
        <p>
          <strong className="font-semibold text-ink">Passerelle activée :</strong> le portail
          demande un code par SMS avant le paiement, et le code du ticket part par SMS après
          l&apos;achat.
        </p>
        <p>
          <strong className="font-semibold text-ink">Passerelle décochée :</strong> plus aucune
          vérification par SMS — le client saisit son numéro et passe directement au paiement,
          puis son code d&apos;accès s&apos;affiche à l&apos;écran. Aucun SMS n&apos;est envoyé,
          donc rien n&apos;est facturé.
        </p>
        <p>
          <strong className="font-semibold text-ink">Crédit SMS épuisé</strong> alors que la
          passerelle est activée : la vente n&apos;est jamais bloquée. Le portail bascule tout
          seul sur le code à l&apos;écran, exactement comme ci-dessus.
        </p>
        <p>
          Les clés sont chiffrées au repos. Après activation, le bouton « Tester » envoie un vrai
          SMS via l&apos;API Wassoya pour vérifier vos identifiants.
        </p>
      </div>
    </div>
  );
}
