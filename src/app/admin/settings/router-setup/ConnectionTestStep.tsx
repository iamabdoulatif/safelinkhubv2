"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { refreshRouterStats } from "@/lib/mikrotik/actions";

type TestStatus = "testing" | "success" | "error";

export default function ConnectionTestStep({
  routerId,
  routerName,
  onBack,
  onNext,
}: {
  routerId: string;
  routerName: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<TestStatus>("testing");
  const [error, setError] = useState<string | null>(null);

  const runTest = useCallback(async () => {
    setStatus("testing");
    setError(null);
    const result = await refreshRouterStats(routerId);
    if (result?.error) {
      setStatus("error");
      setError(result.error);
    } else {
      setStatus("success");
      router.refresh();
    }
  }, [routerId, router]);

  useEffect(() => {
    // runTest makes a network call to verify the router connection; there
    // is no render-time equivalent for "run the connection test on mount".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runTest();
  }, [runTest]);

  return (
    <div className="animate-fade-slide-up mt-8 border-2 border-line bg-paper p-6 text-center">
      <h2 className="font-semibold text-ink">
        Étape 8 : Test de connexion final
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
        Vérification que SafeLinkHub peut communiquer avec {routerName} via
        l&apos;API et le tunnel configurés.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3">
        {status === "testing" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-ink-soft" />
            <p className="text-sm text-ink-soft">
              Test de la connexion en cours...
            </p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-ok" />
            <p className="text-sm font-medium text-ok">
              Connexion confirmée. {routerName} est opérationnel.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-10 w-10 text-red-500" />
            <p className="max-w-md text-sm font-medium text-red-600">
              {error ?? "La connexion a échoué."}
            </p>
          </>
        )}
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line-soft px-5 py-2.5 text-sm font-medium text-ink-soft hover:bg-clay"
        >
          Retour à la topologie
        </button>
        {status === "error" ? (
          <button
            type="button"
            onClick={runTest}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-[#3A362F]"
          >
            Réessayer
          </button>
        ) : status === "success" ? (
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg bg-brand-deep px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-deep"
          >
            Suivant : Tester le portail captif
          </button>
        ) : null}
      </div>
    </div>
  );
}
