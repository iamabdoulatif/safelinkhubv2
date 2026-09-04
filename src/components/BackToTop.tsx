"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export default function BackToTop({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      /* Lime plutôt qu'anthracite : le bouton flotte AUSSI au-dessus du pied de page,
         qui est anthracite — il y devenait une flèche blanche posée sur rien. */
      className={`fixed bottom-24 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-brand text-slate-deep shadow-[0_6px_20px_-6px_rgba(16,22,15,0.45)] transition-opacity duration-300 hover:bg-[#CDE94A] ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
      }`}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
