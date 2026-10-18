import { BookOpen, ExternalLink } from "lucide-react";

export default function FupConfigurationHelp({ consumption = false }: { consumption?: boolean }) {
  return (
    <aside className="mb-5 rounded-xl border border-line bg-clay/40 p-4 sm:p-5" aria-label="Aide à la configuration du FUP">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" /> Première configuration du FUP ?
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        {consumption
          ? "Pour protéger un ou plusieurs forfaits Starlink, commencez dans l’onglet Régulation. Consommation sert au suivi et aux plafonds simples des zones WiFi ; évitez de superposer les deux bridages."
          : "Suivez l’exemple qui correspond à votre installation : deux Starlink avec une enveloppe cumulée, ou un seul Starlink. Les valeurs des guides sont des exemples à adapter à votre forfait."}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium">
        <a href="/guides/configurer-fup.html#fouanga" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-deep underline underline-offset-4">Exemple 1 · FOUANGA : deux Starlink<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only"> (nouvel onglet)</span></a>
        <a href="/guides/configurer-fup.html#kongasso" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-deep underline underline-offset-4">Exemple 2 · KONGASSO : un Starlink<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only"> (nouvel onglet)</span></a>
      </div>
      <details className="mt-4 text-sm leading-6 text-ink-soft">
        <summary className="cursor-pointer font-medium text-ink">Avant de remplir les champs</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Relevez le quota total, les dates du cycle de données et la consommation actuelle dans chaque compte Starlink.</li>
          <li>Vérifiez le nom exact de chaque interface WAN du MikroTik. Le guide ne détecte pas votre câblage.</li>
          <li>Enregistrez les liaisons en observation, puis rapprochez chaque compteur avant d’activer le FUP.</li>
        </ol>
        <a href="/guides/configurer-fup.html#consommation" target="_blank" rel="noreferrer" className="mt-2 inline-block text-brand-deep underline underline-offset-4">Comprendre Consommation, Régulation et les zones WiFi<span className="sr-only"> (nouvel onglet)</span></a>
      </details>
    </aside>
  );
}
