"use client";

import { useEffect, useState, type ReactNode } from "react";
import { readAuthHint } from "@/lib/auth/auth-hint";

/* Masque son contenu quand l'utilisateur est CONNECTÉ (bandeau de promo inutile).
 * Lit le cookie-indice (non secret) dès l'initialisation → pas de flash
 * « Commencer » au rechargement ; /api/session confirme ensuite. Reçoit des
 * `children` déjà rendus côté serveur (sérialisables), donc le bandeau peut
 * garder ses textes issus du dictionnaire (qui contient des fonctions). */
export default function AuthHiddenBar({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(readAuthHint);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setAuthenticated(!!data?.authenticated);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div hidden={authenticated} suppressHydrationWarning>
      {children}
    </div>
  );
}
