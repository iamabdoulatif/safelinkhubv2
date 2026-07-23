"use client";

// Sonde /api/portal/[slug]/status (même origine) après le paiement et affiche
// le code d'accès WiFi dès qu'il est prêt. Fonctionne dans l'onglet du checkout,
// indépendamment de l'onglet du portail (qui, lui, auto-soumet le login routeur).

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Hourglass } from "lucide-react";

type Phase = "loading" | "processing" | "fulfilled" | "failed";

// Thème « Bitume » (tokens de la landing, globals.css) : moutarde + anthracite,
// bordures épaisses, aplats opaques — pas de dégradé, pas d'ombre, angles droits.
const INK = "#1C1917";
const INK_SOFT = "#57534E";
const PAPER = "#FBFAF8";
const CLAY = "#F0EDE6";
const BRAND = "#EAB308";
const OK = "#15803D";
const ERR = "#C2410C";
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', monospace";

/** URL de login du hotspot avec le code en identifiant + mot de passe. Le
 * profil active http-pap → authentification directe, sans md5/chap. `dst`
 * renvoie vers la page d'état du hotspot après connexion. */
function buildConnectUrl(loginUrl: string, code: string): string {
  const url = new URL(loginUrl);
  url.searchParams.set("username", code);
  url.searchParams.set("password", code);
  url.searchParams.set("dst", loginUrl.replace(/\/login$/, "/status"));
  return url.toString();
}

const CARD: React.CSSProperties = {
  maxWidth: 380,
  width: "100%",
  textAlign: "center",
  background: PAPER,
  border: `2px solid ${INK}`,
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
  // false ⇒ le SMS de secours n'est pas parti (crédit SMS du point de vente
  // épuisé…) : l'écran est la seule trace du code, on insiste sur la copie.
  const [smsSent, setSmsSent] = useState(true);
  const [copied, setCopied] = useState(false);
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
          smsSent?: boolean;
        };
        if (!active) return;
        if (data.status === "fulfilled") {
          if (data.code) setCode(data.code);
          if (data.loginUrl) setLoginUrl(data.loginUrl);
          if (data.smsSent === false) setSmsSent(false);
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

  // Copie du code au toucher. clipboard API (contexte https) avec repli
  // execCommand pour les mini-navigateurs captifs qui ne l'exposent pas.
  function copyCode() {
    if (!code) return;
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code) && done());
    } else if (fallbackCopy(code)) {
      done();
    }
  }
  function fallbackCopy(text: string): boolean {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, 99999);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  // Auto-connexion : le téléphone (encore sur le WiFi captif) navigue vers le
  // login du hotspot avec le code en identifiant + mot de passe (bouton
  // manuel ; le déclenchement automatique vit dans l'effet ci-dessous).
  function connectNow() {
    if (!loginUrl || !code) return;
    autoTriedRef.current = true; // plus de déclenchement auto après un clic
    setCountdown(null);
    window.location.assign(buildConnectUrl(loginUrl, code));
  }

  // Déclenchement AUTOMATIQUE dès l'affichage du code : compte à rebours de
  // 3 s (le client voit son code — il part aussi par SMS) puis navigation vers
  // le login du hotspot. Une seule fois (autoTriedRef) : si la connexion
  // échoue et que le client revient ici (retour navigateur / bfcache), on ne
  // le repiège pas en boucle — le bouton manuel reste.
  const autoTriedRef = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== "fulfilled" || !code || !loginUrl || autoTriedRef.current) return;
     
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timer);
          // fin du décompte → tentative unique d'auto-connexion
          if (!autoTriedRef.current) {
            autoTriedRef.current = true;
            window.location.assign(buildConnectUrl(loginUrl, code));
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, code, loginUrl]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        background: PAPER,
        color: INK,
      }}
    >
      <div style={CARD}>
        {phase === "fulfilled" ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <CheckCircle2 size={44} color={OK} style={{ display: "inline-block" }} />
            </div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 6px" }}>
              Paiement reçu
            </h1>
            <p
              style={{
                color: INK_SOFT,
                fontSize: ".72rem",
                fontFamily: MONO,
                textTransform: "uppercase",
                letterSpacing: ".12em",
                margin: "0 0 6px",
              }}
            >
              Votre code WiFi
            </p>
            <button
              type="button"
              onClick={copyCode}
              title="Toucher pour copier"
              style={{
                display: "block",
                width: "100%",
                fontSize: "2rem",
                fontWeight: 700,
                fontFamily: MONO,
                letterSpacing: ".18em",
                color: INK,
                background: CLAY,
                border: `2px solid ${INK}`,
                padding: "10px 8px",
                margin: "0 0 4px",
                cursor: "pointer",
              }}
            >
              {code || "…"}
            </button>
            <p
              style={{
                color: copied ? OK : INK_SOFT,
                fontSize: ".78rem",
                fontFamily: MONO,
                margin: "0 0 12px",
              }}
            >
              {copied ? "Code copié !" : "Touchez le code pour le copier"}
            </p>
            {loginUrl && code ? (
              <>
                {countdown !== null && (
                  <p
                    style={{
                      color: INK_SOFT,
                      fontSize: ".82rem",
                      fontFamily: MONO,
                      margin: "0 0 8px",
                    }}
                  >
                    Connexion automatique dans {countdown} s…
                  </p>
                )}
                <button
                  type="button"
                  onClick={connectNow}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    margin: "0 0 12px",
                    border: `2px solid ${INK}`,
                    background: BRAND,
                    color: INK,
                    fontSize: "1rem",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {countdown !== null ? "Me connecter maintenant" : "Connecter mon téléphone"}
                </button>
                <p style={{ color: INK_SOFT, fontSize: ".82rem", margin: 0 }}>
                  Ça ne marche pas ? Retournez sur le portail WiFi (onglet <b>Code</b>) et
                  saisissez ce code.{" "}
                  {smsSent ? (
                    <>Il vous a aussi été envoyé par <b>SMS</b>.</>
                  ) : (
                    <b>Copiez ou notez bien ce code : l&rsquo;envoi par SMS est indisponible.</b>
                  )}
                </p>
              </>
            ) : (
              <p style={{ color: INK_SOFT, fontSize: ".92rem", margin: 0 }}>
                Retournez sur le portail WiFi (onglet <b>Code</b>) et saisissez ce code pour vous
                connecter.{" "}
                {smsSent ? (
                  <>Il vous a aussi été envoyé par <b>SMS</b>.</>
                ) : (
                  <b>Copiez ou notez bien ce code : l&rsquo;envoi par SMS est indisponible.</b>
                )}
              </p>
            )}
          </>
        ) : phase === "failed" ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <AlertTriangle size={44} color={ERR} style={{ display: "inline-block" }} />
            </div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 8px" }}>
              Paiement non abouti
            </h1>
            <p style={{ color: INK_SOFT, fontSize: ".95rem", margin: 0 }}>
              {error || "Le paiement n’a pas pu être finalisé. Revenez à l’onglet WiFi pour réessayer."}
            </p>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <Hourglass size={44} color={INK_SOFT} style={{ display: "inline-block" }} />
            </div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 8px" }}>
              {phase === "loading" ? "Paiement reçu" : "Activation en cours"}
            </h1>
            <p style={{ color: INK_SOFT, fontSize: ".95rem", margin: 0 }}>
              Nous préparons votre accès… Votre code s’affichera ici et vous sera envoyé par SMS.
              Vous pouvez aussi retourner à l’onglet WiFi.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
