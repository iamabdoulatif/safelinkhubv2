import Link from "next/link";
import { ExternalLink, Router as RouterIcon } from "lucide-react";

export type InstalledPortal = {
  routerId: string;
  routerName: string;
  status: string;
  templateId: string;
  templateName: string;
  entry: string;
  /** Jeton signé côté serveur (preview-token.ts). */
  token: string;
  /** Déduit (pas enregistré à l'installation) — routeurs configurés avant le suivi. */
  inferred: boolean;
};

const FRAME_W = 390; // largeur d'un téléphone courant : le portail est pensé pour ça
const FRAME_H = 780;
const SCALE = 0.6;

export function previewUrl(token: string, entry: string) {
  return `/api/portal-preview/${token}/${entry.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Ce que voient VRAIMENT les clients de chaque routeur : le portail installé,
 * rendu depuis ses propres fichiers avec le SSID, les forfaits et le branding
 * de ce routeur — pas une maquette aux couleurs du thème.
 */
export default function InstalledPortals({
  portals,
  withoutPortal,
}: {
  portals: InstalledPortal[];
  withoutPortal: { id: string; name: string }[];
}) {
  return (
    <section aria-labelledby="sur-vos-routeurs" className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="sur-vos-routeurs" className="text-lg font-semibold text-ink">
            Sur vos routeurs
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            La page exacte que voient vos clients en se connectant, routeur par routeur.
          </p>
        </div>
        <Link href="?vue=deployer" className="btn btn-sm btn-outline">
          Installer un portail
        </Link>
      </div>

      {portals.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-soft">
          Aucun portail installé pour l&apos;instant. Installez-en un depuis l&apos;onglet « Déployer ».
        </p>
      ) : (
        <ul role="list" className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
          {portals.map((p) => {
            const url = previewUrl(p.token, p.entry);
            const online = p.status === "online";
            return (
              <li key={p.routerId} className="flex flex-col">
                {/* Cadre de téléphone : l'iframe est rendue à taille réelle puis
                    réduite, pour que le portail se mette en page comme sur un
                    vrai écran de 390 px. */}
                <div
                  className="relative mx-auto overflow-hidden rounded-[1.75rem] border-[6px] border-slate-deep bg-slate-deep shadow-menu"
                  style={{ width: FRAME_W * SCALE + 12, height: FRAME_H * SCALE + 12 }}
                >
                  <iframe
                    src={url}
                    title={`Portail captif de ${p.routerName}`}
                    loading="lazy"
                    sandbox="allow-scripts allow-forms"
                    tabIndex={-1}
                    className="pointer-events-none origin-top-left border-0 bg-paper"
                    style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${SCALE})` }}
                  />
                </div>

                <div className="mt-3 min-w-0 px-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${online ? "bg-ok" : "bg-err"}`}
                    />
                    <span className="truncate">{p.routerName}</span>
                    <span className="sr-only">{online ? "en ligne" : "hors ligne"}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-soft" title={p.templateName}>
                    {p.templateName}
                    {p.inferred && (
                      <span
                        className="ml-1.5 rounded bg-clay px-1.5 py-0.5 text-[10px] font-medium"
                        title="Installé avant le suivi des portails : déduit de la configuration du routeur."
                      >
                        présumé
                      </span>
                    )}
                  </p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink hover:underline"
                  >
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                    Ouvrir en grand
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {withoutPortal.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <RouterIcon aria-hidden="true" className="h-4 w-4" />
          <span>Portail inconnu :</span>
          {withoutPortal.map((r) => (
            <span key={r.id} className="rounded-md border border-line bg-paper px-2 py-0.5 text-xs text-ink">
              {r.name}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
