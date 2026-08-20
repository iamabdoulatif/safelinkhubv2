"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Package, RefreshCw } from "lucide-react";
import {
  importSafelinkhubDefaultPackage,
  importYahyaWifiPackage,
} from "@/lib/captive-templates/actions";
import type { PackageFile } from "@/lib/captive-templates/package-files";
import { ButtonLoader } from "@/components/FancyLoader";
import PackagePreview from "./PackagePreview";

export type DefaultPortal = {
  // Clé de l'importeur bundled correspondant (voir IMPORTERS).
  key: "sfh1" | "sfh2";
  name: string;
  description: string;
  // Uniquement les .css : PackagePreview n'en tire que le schéma de couleurs,
  // inutile d'envoyer les images base64 du package au client pour l'aperçu.
  previewFiles: PackageFile[];
  // Vrai si l'org a déjà importé ce portail (template package de même nom).
  alreadyAdded: boolean;
};

// Chaque portail par défaut est adossé à une Server Action d'import bundled
// dédiée (elles sont idempotentes : réimporter re-synchronise sans doublon).
const IMPORTERS = {
  sfh1: importSafelinkhubDefaultPackage,
  sfh2: importYahyaWifiPackage,
} as const;

/**
 * Met en avant les portails captifs prêts à l'emploi fournis par SafeLinkHub,
 * dans les réglages de CHAQUE organisation. L'org choisit de les adopter (bouton
 * « Utiliser ce portail » → copie le package dans ses modèles) ou de les ignorer.
 * Remplace les anciens boutons techniques « Importer hotspot-sfh1/2 » de
 * TemplatesManager par un choix visuel avec aperçu.
 */
export default function DefaultPortals({ portals }: { portals: DefaultPortal[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Même comportement que TemplatesManager : si on vient du wizard routeur
  // (?retour=<routerId>), on y retourne après avoir adopté un portail.
  const retour = searchParams.get("retour");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function adopt(portal: DefaultPortal) {
    setError(null);
    setPendingKey(portal.key);
    startTransition(async () => {
      const res = await IMPORTERS[portal.key]();
      setPendingKey(null);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      if (retour) {
        router.push(`/admin/settings/router-setup?router=${encodeURIComponent(retour)}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-ink">Portails par défaut</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Deux portails captifs prêts à l&apos;emploi fournis par SafeLinkHub.
        Utilisez-les tels quels — vous pourrez ensuite les personnaliser, les
        définir par défaut ou les assigner à un bridge.
      </p>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {portals.map((portal) => {
          const busy = isPending && pendingKey === portal.key;
          return (
            <div key={portal.key} className="border border-line bg-paper p-3 rounded-xl">
              <div className="h-40 overflow-hidden rounded-lg bg-clay">
                <PackagePreview files={portal.previewFiles} />
              </div>
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{portal.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{portal.description}</p>
                </div>
                {portal.alreadyAdded && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok">
                    <Check className="h-3 w-3" /> Ajouté
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => adopt(portal)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-line-soft px-3 py-1.5 text-sm font-medium text-ink hover:bg-clay disabled:opacity-60"
              >
                {busy ? (
                  <ButtonLoader size="sm" color="currentColor" />
                ) : portal.alreadyAdded ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
                {portal.alreadyAdded ? "Mettre à jour" : "Utiliser ce portail"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
