"use client";

// Sonde /api/portal/[slug]/status (même origine) après le paiement et affiche
// le code d'accès WiFi dès qu'il est prêt. Fonctionne dans l'onglet du checkout,
// indépendamment de l'onglet du portail (qui, lui, auto-soumet le login routeur).

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Hourglass } from "lucide-react";

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
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  // URL de login du hotspot du routeur (renvoyée par /status à l'honneur) →
  // bouton d'auto-connexion. null quand le routeur n'a pas d'instantané
  // exploitable : on n'affiche alors que la saisie manuelle du code.
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

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
        const data = (await res.json()) as {
          status?: string;
          code?: string;
          error?: string;
          loginUrl?: string | null;
        };
        if (!active) return;
        if (data.status === "fulfilled") {
          if (data.code) setCode(data.code);
          if (data.loginUrl) setLoginUrl(data.loginUrl);
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

  // Auto-connexion : le téléphone (encore sur le WiFi captif) navigue vers le
  // login du hotspot avec le code en identifiant + mot de passe. Le profil
  // active http-pap → authentification directe, sans md5/chap. `dst` renvoie
  // vers la page d'état du hotspot après connexion.
  function autoConnect() {
    if (!loginUrl || !code) return;
    const url = new URL(loginUrl);
    url.searchParams.set("username", code);
    url.searchParams.set("password", code);
    url.searchParams.set("dst", loginUrl.replace(/\/login$/, "/status"));
    window.location.href = url.toString();
  }

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
            <div style={{ marginBottom: 8 }}>
              <CheckCircle2 size={44} color="#16a34a" style={{ display: "inline-block" }} />
            </div>
            <h1 style={{ fontSize: "1.25rem", margin: "0 0 6px" }}>Paiement reçu</h1>
            <p style={{ color: "#64748b", fontSize: ".85rem", margin: "0 0 6px" }}>Votre code WiFi</p>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                letterSpacing: ".18em",
                color: "#0f172a",
                margin: "0 0 10px",
              }}
            >
              {code || "…"}
            </div>
            {loginUrl && code ? (
              <>
                <button
                  type="button"
                  onClick={autoConnect}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    margin: "4px 0 12px",
                    border: 0,
                    borderRadius: 10,
                    background: "#16a34a",
                    color: "#fff",
                    fontSize: "1rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Connecter automatiquement mon téléphone
                </button>
                <p style={{ color: "#64748b", fontSize: ".82rem", margin: 0 }}>
                  Ça ne marche pas ? Retournez sur le portail WiFi (onglet <b>Code</b>) et
                  saisissez ce code. Il vous a aussi été envoyé par <b>SMS</b>.
                </p>
              </>
            ) : (
              <p style={{ color: "#64748b", fontSize: ".92rem", margin: 0 }}>
                Retournez sur le portail WiFi (onglet <b>Code</b>) et saisissez ce code pour vous
                connecter. Il vous a aussi été envoyé par <b>SMS</b>.
              </p>
            )}
          </>
        ) : phase === "failed" ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <AlertTriangle size={44} color="#dc2626" style={{ display: "inline-block" }} />
            </div>
            <h1 style={{ fontSize: "1.25rem", margin: "0 0 8px" }}>Paiement non abouti</h1>
            <p style={{ color: "#64748b", fontSize: ".95rem", margin: 0 }}>
              {error || "Le paiement n’a pas pu être finalisé. Revenez à l’onglet WiFi pour réessayer."}
            </p>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <Hourglass size={44} color="#64748b" style={{ display: "inline-block" }} />
            </div>
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
