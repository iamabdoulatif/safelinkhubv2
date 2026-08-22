"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
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
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:bg-clay">
        Action
        <ChevronDown className="h-3.5 w-3.5" />
      </summary>

      <div className="absolute right-0 z-20 mt-1 w-48 border border-line bg-paper p-1 shadow-lg">
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
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-brand hover:text-slate-deep"
            >
              Valider
            </button>
            <button
              name="decision"
              value="rejected"
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-err hover:bg-err-soft"
            >
              Refuser
            </button>
          </form>
        ) : (
          <p className="px-3 py-2 text-[11px] leading-4 text-ink-soft">
            Dossier non soumis : rien à décider.
          </p>
        )}
        <Link
          href={`/admin/kyc/${orgId}`}
          className="mt-1 block border-t border-line-soft px-3 py-2 text-xs font-semibold text-ink hover:bg-clay"
        >
          Voir le détail
        </Link>
      </div>
    </details>
  );
}
