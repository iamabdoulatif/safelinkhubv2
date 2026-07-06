"use client";

// Unité publicitaire Google AdSense affichée dans le blog. Le chargeur
// (adsbygoogle.js) est injecté globalement par AnalyticsScripts ; ici on
// déclare une unité et on demande son rendu au montage.

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function BlogAd({ client, slot }: { client: string; slot: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense non chargé (bloqueur de pub, script absent) — sans gravité.
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
      aria-hidden="true"
    />
  );
}
