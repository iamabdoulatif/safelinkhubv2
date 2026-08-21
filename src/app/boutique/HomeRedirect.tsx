"use client";

// Bascule automatique de /boutique vers l'accueil, avec DÉCOMPTE VISIBLE.
//
// Pourquoi pas un `redirect()` serveur : il renverrait l'accueil sans que le
// message « Site en construction » soit jamais affiché — or c'est justement ce
// message qu'on veut montrer. Le visiteur le lit, comprend pourquoi il est
// déplacé, et part de lui-même s'il ne veut pas attendre.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/lib/i18n/fr";

export default function HomeRedirect({
  seconds = 8,
  href = "/",
  t,
}: {
  seconds?: number;
  href?: string;
  t: Dictionary["boutique"];
}) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    // Un seul intervalle : il décrémente, et déclenche la navigation en
    // atteignant zéro (plutôt qu'un setTimeout séparé qui pourrait dériver du
    // compteur affiché et rediriger pendant qu'on lit encore « 2 »).
    const id = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(id);
          router.push(href);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [href, router]);

  return (
    <p aria-live="polite" className="mt-4 text-sm text-ink-soft">
      {left > 0 ? (
        <>
          {t.countdown} <span className="font-mono font-bold text-ink">{left}</span>{" "}
          {left > 1 ? t.secondMany : t.secondOne}…
        </>
      ) : (
        <>{t.redirecting}</>
      )}
    </p>
  );
}
