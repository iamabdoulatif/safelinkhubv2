"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { UI, type AssistantUiLocale } from "./support-chat-ui";

/* Le panneau n'est TÉLÉCHARGÉ qu'à la première ouverture.
 *
 * Ce composant est monté par le layout racine, donc présent sur le portail
 * captif — servi derrière le walled-garden à des téléphones qui n'ont pas
 * encore payé leur connexion. Y envoyer la conversation entière, son flux et
 * ses icônes pour un bouton qui ne s'y affiche même pas serait payé en data
 * par le client. Ici, seul le bouton voyage. */
const SupportChatPanel = dynamic(() => import("./SupportChatPanel"), { ssr: false });

/** Le chemin dit la langue, et dit aussi où l'assistant n'a rien à faire. */
export function readPath(pathname: string): { locale: AssistantUiLocale; hidden: boolean } {
  const english = pathname === "/en" || pathname.startsWith("/en/");
  return {
    locale: english ? "en" : "fr",
    /* Ni dans l'administration (on y travaille, on n'y découvre pas le
       produit), ni sur le portail captif, ni sur les écrans de connexion. */
    hidden:
      pathname.startsWith("/admin") ||
      pathname.startsWith("/portal") ||
      pathname.startsWith("/auth"),
  };
}

export default function SupportChat() {
  const pathname = usePathname() ?? "/";
  const { locale, hidden } = readPath(pathname);
  const [open, setOpen] = useState(false);
  /* Une fois ouvert, le panneau reste MONTÉ : le refermer ne doit pas effacer
     la conversation en cours. */
  const [monte, setMonte] = useState(false);

  if (hidden) return null;
  const t = UI[locale];

  return (
    /* La peau Slate est posée par chaque page publique, pas par le layout
       racine : sans elle ici, le bouton sortirait en moutarde Bitume au lieu
       du lime du produit. */
    <div className="theme-slate">
      <button
        type="button"
        hidden={open}
        onClick={() => {
          setMonte(true);
          setOpen(true);
        }}
        aria-label={t.open}
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-[#10160F] shadow-[0_6px_20px_-6px_rgba(16,22,15,0.45)] transition-transform duration-200 hover:scale-105"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <MessageCircle aria-hidden="true" className="h-6 w-6" />
      </button>

      {monte && <SupportChatPanel open={open} locale={locale} onClose={() => setOpen(false)} />}
    </div>
  );
}
