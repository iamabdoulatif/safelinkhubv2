"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/* Un SEUL observateur pour toute la page.
 *
 * Pourquoi pas un composant enveloppant par bloc : il aurait fallu convertir en
 * composants client des sections qui sont aujourd'hui rendues sur le serveur —
 * Hero, Tarifs, FAQ… — pour le seul bénéfice d'une animation. Ici les sections
 * restent serveur et se contentent d'une classe `reveal` ; ce module est monté
 * une fois par surface et fait le reste.
 *
 * Il n'y a AUCUN état masqué tant que ce script n'a pas tourné : la règle
 * `opacity: 0` vit sous @media (scripting: enabled) dans globals.css. Un
 * observateur qui ne démarre pas laisse donc une page lisible, pas une page
 * blanche.
 *
 * DEUX FILETS, parce qu'un contenu resté à opacity 0 est un écran perdu :
 *
 *   1. `usePathname` en dépendance. Monté dans le layout /admin, l'effet ne se
 *      rejouerait PAS à la navigation client — la coquille persiste. Les blocs
 *      de la page suivante resteraient invisibles pour toujours.
 *
 *   2. Un délai de garde, mais CIBLÉ. Au bout de trois secondes, on révèle
 *      seulement ce qui est déjà dans le champ sans avoir été révélé —
 *      observateur en échec, élément dans un conteneur à défilement propre.
 *      Une première version révélait TOUT au bout du délai : elle annulait
 *      l'effet qu'elle devait protéger, puisque le bas de page apparaissait
 *      sans qu'on y soit jamais descendu. Mesuré : 45 blocs sur 49 révélés
 *      alors qu'ils étaient sous la ligne de flottaison.
 */

const REVEALED = "true";

export default function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const show = (el: HTMLElement) => {
      el.dataset.shown = REVEALED;
      const target = el.dataset.countup;
      if (target && !reduced) countUp(el, Number(target));
    };

    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".reveal:not([data-shown])"));
    if (reduced || !("IntersectionObserver" in window)) {
      nodes.forEach(show);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target as HTMLElement);
          io.unobserve(entry.target);
        }
      },
      // Se déclenche un peu AVANT le bord bas : l'animation a le temps de se
      // jouer pendant que l'élément monte, au lieu de démarrer une fois qu'on
      // le regarde déjà.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    nodes.forEach((n) => io.observe(n));

    // Ciblé : seuls les blocs DÉJÀ visibles et restés masqués sont rattrapés.
    // Ceux qui attendent plus bas restent sous la garde de l'observateur.
    const safety = window.setTimeout(() => {
      for (const n of nodes) {
        if (n.dataset.shown) continue;
        const r = n.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) show(n);
      }
    }, 3000);
    return () => {
      window.clearTimeout(safety);
      io.disconnect();
    };
  }, [pathname]);

  return null;
}

/**
 * Compte de zéro jusqu'à la valeur cible, puis REMET le texte d'origine.
 *
 * Le serveur a déjà rendu la chaîne finale, séparateurs de milliers compris
 * (« 1 579 », espace fine insécable). La recomposer en JavaScript risquerait de
 * produire un formatage différent ; on la garde de côté et on la restitue à la
 * dernière image.
 */
function countUp(el: HTMLElement, to: number) {
  if (!Number.isFinite(to) || to <= 0) return;
  const final = el.textContent ?? "";
  const nf = new Intl.NumberFormat("fr-FR");
  const duration = 900;
  const start = performance.now();

  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    // Sortie cubique : rapide au début, se pose sans rebond.
    const eased = 1 - Math.pow(1 - t, 3);
    if (t < 1) {
      el.textContent = nf.format(Math.round(to * eased));
      requestAnimationFrame(tick);
    } else {
      el.textContent = final;
    }
  };
  requestAnimationFrame(tick);
}
