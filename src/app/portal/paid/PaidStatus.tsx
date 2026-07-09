"use client";

// Sonde /api/portal/[slug]/status (même origine) après le paiement et affiche
// le code d'accès WiFi dès qu'il est prêt. Fonctionne dans l'onglet du checkout,
// indépendamment de l'onglet du portail (qui, lui, auto-soumet le login routeur).

import { useEffect, useState } from "react";

type Phase = "loading" | "processing" | "fulfilled" | "failed";

const CARD: React.CSSProperties = {
  maxWidth: 380,
  width: "100%",
  textAlign: "center",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 28,
};

export default function PaidStatus({
  isError,
  orderId,
  slug,
}: {
  isError: boolean;
  orderId: string;
  slug: string;
}) {
  const canPoll = Boolean(orderId && slug) && !isError;
  const [phase, setPhase] = useState<Phase>(isError ? "failed" : canPoll ? "loading" : "processing");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canPoll) return;
    let active = true;
    let tries = 0;
    const max = 90;

    async function tick() {
      if (!active) return;
      tries += 1;
      try {
        const res = await fetch(
          `/api/portal/${encodeURIComponent(slug)}/status?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as { status?: string; code?: string; error?: string };
        if (!active) return;
        if (data.status === "fulfilled" && data.code) {
          setCode(data.code);
          setPhase("fulfilled");
          return;
        }
        if (data.status === "failed") {
          setError(data.error || "Paiement échoué.");
          setPhase("failed");
          return;
        }
        setPhase("processing");
      } catch {
        // Erreur transitoire : on continue de sonder.
      }
      if (active && tries < max) {
        timer = setTimeout(tick, 4000);
      }
    }

    let timer = setTimeout(tick, 800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [canPoll, orderId, slug]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <div style={CARD}>
        {phase === "fulfilled" ? (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <h1 style={{ fontSize: "1.25rem", margin: "0 0 4px" }}>Paiement reçu</h1>
            <p style={{ color: "#64748b", fontSize: ".85rem", margin: "0 0 14px" }}>
              Votre code d’accès WiFi
            </p>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                letterSpacing: ".18em",
                background: "#f1f5f9",
                borderRadius: 12,
                padding: "14px 8px",
                marginBottom: 14,
              }}
            >
              {code}
            </div>
            <p style={{ color: "#64748b", fontSize: ".9rem", margin: 0 }}>
              Retournez à l’onglet WiFi : la connexion s’ouvre automatiquement. Ce code vous est
              aussi envoyé par SMS.
            </p>
          </>
        ) : phase === "failed" ? (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
            <h1 style={{ fontSize: "1.25rem", margin: "0 0 8px" }}>Paiement non abouti</h1>
            <p style={{ color: "#64748b", fontSize: ".95rem", margin: 0 }}>
              {error || "Le paiement n’a pas pu être finalisé. Revenez à l’onglet WiFi pour réessayer."}
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 44, marginBottom: 8 }}>⏳</div>
            <h1 style={{ fontSize: "1.25rem", margin: "0 0 8px" }}>
              {phase === "loading" ? "Paiement reçu" : "Activation en cours"}
            </h1>
            <p style={{ color: "#64748b", fontSize: ".95rem", margin: 0 }}>
              Nous préparons votre accès… Votre code s’affichera ici et vous sera envoyé par SMS.
              Vous pouvez aussi retourner à l’onglet WiFi.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
