"use client";

import { useEffect } from "react";

/**
 * Splash overlay shown only on the landing page (/).
 * Injected as a client component so it never bleeds into admin/auth routes.
 */
export default function SplashLoader() {
  useEffect(() => {
    const el = document.getElementById("slh-splash");
    if (!el) return;

    function dismiss() {
      el!.classList.add("slh-fade");
      setTimeout(() => el!.remove(), 4100);
    }

    if (document.readyState === "complete") {
      dismiss();
    } else {
      window.addEventListener("load", dismiss, { once: true });
      return () => window.removeEventListener("load", dismiss);
    }
  }, []);

  return (
    <>
      <div id="slh-splash" aria-hidden="true">
        <span className="slh-loader" />
      </div>
    </>
  );
}
