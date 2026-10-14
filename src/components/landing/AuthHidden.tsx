"use client";

import { useEffect, useState, type ReactNode } from "react";
import { readAuthHint } from "@/lib/auth/auth-hint";

/* Masque son contenu (en ligne) quand l'utilisateur est CONNECTÉ, sans toucher
 * au reste. Lit le cookie-indice (non secret) dès l'initialisation → pas de
 * flash au rechargement ; /api/session confirme. Sert à retirer le CTA
 * « Commencer » du bandeau tout en gardant le texte et les réseaux. */
export default function AuthHidden({ children }: { children: ReactNode }) {
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
    <span hidden={authenticated} suppressHydrationWarning>
      {children}
    </span>
  );
}
