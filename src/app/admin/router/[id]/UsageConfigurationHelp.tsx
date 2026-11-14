import { BookOpen } from "lucide-react";

export default function UsageConfigurationHelp() {
  return (
    <aside className="mb-5 rounded-xl border border-line bg-clay/40 p-4 sm:p-5" aria-label="Aide à la configuration de la consommation">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" /> Première configuration du quota ?
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Configurez le quota du lien et, si nécessaire, les plafonds des zones WiFi. Les valeurs sont propres à votre forfait.
      </p>
      <details className="mt-4 text-sm leading-6 text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink">Avant de remplir les champs</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Relevez le quota et le jour de début du cycle de facturation de votre forfait.</li>
          <li>Vérifiez le nom exact de l’interface WAN du MikroTik.</li>
          <li>Enregistrez puis contrôlez le premier relevé avant d’activer un plafond.</li>
        </ol>
      </details>
    </aside>
  );
}
