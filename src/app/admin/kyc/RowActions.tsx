"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Check, MoreHorizontal, X } from "lucide-react";
import { decideVerification } from "@/lib/kyc/actions";

/**
 * Menu « Action » d'une ligne de la file : valider, refuser, ouvrir la fiche.
 *
 * `<details>` porte l'ouverture — pas d'état React à synchroniser, et le
 * clavier fonctionne sans qu'on écrive quoi que ce soit. Il ne sait pas se
 * fermer quand on clique ailleurs : c'est le seul comportement ajouté.
 *
 * La décision est DÉFINITIVE (une fois décidé, le dossier n'est plus
 * modifiable), donc chaque bouton demande confirmation. Sans cela, un clic de
 * travers dans une liste de vingt lignes valide l'identité de quelqu'un.
 */
export default function RowActions({
  orgId,
  orgName,
  decidable,
}: {
  orgId: string;
  orgName: string;
  decidable: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const fermer = (e: Event) => {
      const d = ref.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current) ref.current.open = false;
    };
    document.addEventListener("pointerdown", fermer);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", fermer);
      document.removeEventListener("keydown", echap);
    };
  }, []);

  return (
    <details ref={ref} className="relative inline-block [&>summary::-webkit-details-marker]:hidden">
      <summary
        aria-label={`Autres actions pour ${orgName}`}
        className="btn btn-sm btn-ghost w-8 cursor-pointer list-none px-0"
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </summary>

      <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-line bg-paper p-1 text-left shadow-menu">
        {decidable ? (
          <form
            action={decideVerification}
            onSubmit={(e) => {
              const decision = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
              const mot = decision?.value === "approved" ? "Valider" : "Refuser";
              if (!confirm(`${mot} définitivement la vérification de « ${orgName} » ?`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="orgId" value={orgId} />
            <button
              name="decision"
              value="approved"
              className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-clay"
            >
              <Check aria-hidden="true" className="h-4 w-4 text-ok" />
              Valider
            </button>
            <button
              name="decision"
              value="rejected"
              className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium text-err hover:bg-err-soft"
            >
              <X aria-hidden="true" className="h-4 w-4" />
              Refuser
            </button>
          </form>
        ) : (
          <p className="px-3 py-2 text-xs leading-5 text-ink-soft">
            Dossier non soumis : rien à décider.
          </p>
        )}
        <Link
          href={`/admin/kyc/${orgId}`}
          className="mt-1 flex h-9 items-center rounded-lg border-t border-line-soft px-3 text-sm font-medium text-ink hover:bg-clay"
        >
          Voir le détail
        </Link>
      </div>
    </details>
  );
}
