"use client";

import { useEffect } from "react";

const MIN_DISPLAY_MS = 1600; // laisse la barre crantée finir son remplissage
const EXIT_MS = 700; // durée du rideau de sortie (cf. transition CSS)

/**
 * Splash overlay shown only on the landing page (/).
 * Injected as a client component so it never bleeds into admin/auth routes.
 */
export default function SplashLoader() {
  useEffect(() => {
    const el = document.getElementById("slh-splash");
    if (!el) return;

    const shownAt = performance.now();
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let removeTimer: ReturnType<typeof setTimeout> | undefined;

    function dismiss() {
      const elapsed = performance.now() - shownAt;
      const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
      exitTimer = setTimeout(() => {
        el!.classList.add("slh-exit");
        removeTimer = setTimeout(() => el!.remove(), EXIT_MS);
      }, wait);
    }

    if (document.readyState === "complete") {
      dismiss();
    } else {
      window.addEventListener("load", dismiss, { once: true });
    }
    return () => {
      window.removeEventListener("load", dismiss);
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  return (
    <div id="slh-splash" aria-hidden="true">
      <p className="slh-wordmark" translate="no">
        Safe<span className="slh-mark">LinkHub</span>
      </p>
      <div className="slh-bar">
        <span className="slh-bar-fill" />
      </div>
      <p className="slh-caption">Initialisation du réseau</p>
    </div>
  );
}
