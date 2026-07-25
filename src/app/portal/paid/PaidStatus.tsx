"use client";

// Sonde /api/portal/[slug]/status (même origine) après le paiement et affiche
// le code d'accès WiFi dès qu'il est prêt. Fonctionne dans l'onglet du checkout,
// indépendamment de l'onglet du portail (qui, lui, auto-soumet le login routeur).

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, MessageSquareText, Plus, Wifi } from "lucide-react";

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
  // true ⇒ le SMS a déjà été envoyé (à la demande ou filet). Sinon on propose
  // le bouton « Recevoir par SMS » (le code n'est plus envoyé d'office).
  const [smsSent, setSmsSent] = useState(false);
  const [copied, setCopied] = useState(false);
  // État du bouton « Recevoir par SMS » : idle | sending | sent | error.
  const [smsState, setSmsState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [smsError, setSmsError] = useState("");
  // URL de login du hotspot du routeur (renvoyée par /status à l'honneur) →
  // bouton d'auto-connexion. null quand le routeur n'a pas d'instantané
  // exploitable : on n'affiche alors que la saisie manuelle du code.
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  // « Acheter un autre ticket » : rachat en un tap pour un autre téléphone
  // (même numéro déjà vérifié). idle | loading | error.
  const [rebuyState, setRebuyState] = useState<"idle" | "loading" | "error">("idle");
  const [rebuyError, setRebuyError] = useState("");

  useEffect(() => {
    if (!canPoll) return;
    let active = true;
    let tries = 0;
    const max = 150;
    // Cadence ADAPTATIVE : le client vient de payer, on sonde vite pour afficher
    // le code au plus tôt (1,2 s au début), puis on ralentit si l'attente se
    // prolonge (économie serveur). Avant : 4 s fixes → le code « tardait ».
    const delayFor = (n: number) => (n < 20 ? 1200 : n < 40 ? 2500 : 4000);

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
          if (data.smsSent === true) {
            setSmsSent(true);
            setSmsState("sent");
          }
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
        timer = setTimeout(tick, delayFor(tries));
      }
    }

    let timer = setTimeout(tick, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [canPoll, orderId, slug]);

  // « Recevoir par SMS » : envoie le code au numéro de la commande, à la demande
  // (le code n'est plus envoyé d'office → on économise les crédits SMS).
  async function requestSms() {
    if (!orderId || smsState === "sending" || smsState === "sent") return;
    setSmsState("sending");
    setSmsError("");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/ticket-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await res.json()) as { sent?: boolean; error?: string };
      if (!res.ok || !data.sent) throw new Error(data.error || "Envoi impossible.");
      setSmsState("sent");
      setSmsSent(true);
    } catch (e) {
      setSmsState("error");
      setSmsError(e instanceof Error ? e.message : "Envoi impossible.");
    }
  }

  // « Acheter un autre ticket » : clone la commande courante (même numéro déjà
  // vérifié, même forfait) en un nouveau ticket et redirige vers le choix du
  // moyen de paiement. Sert le cas « 2 téléphones, 1 numéro » quand les deux
  // achats partent du même appareil.
  async function rebuy() {
    if (!orderId || rebuyState === "loading") return;
    setRebuyState("loading");
    setRebuyError("");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/rebuy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await res.json()) as { payUrl?: string; error?: string };
      if (!res.ok || !data.payUrl) throw new Error(data.error || "Rachat impossible. Réessayez.");
      window.location.assign(data.payUrl);
    } catch (e) {
      setRebuyState("error");
      setRebuyError(e instanceof Error ? e.message : "Rachat impossible. Réessayez.");
    }
  }

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

            {/* Choix du client : recevoir le code par SMS OU le copier. Le SMS
                n'est envoyé qu'à la demande (économie de crédits). */}
            <div style={{ display: "flex", gap: 8, margin: "0 0 12px" }}>
              <button
                type="button"
                onClick={requestSms}
                disabled={smsState === "sending" || smsState === "sent"}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "11px 8px",
                  border: `2px solid ${INK}`,
                  background: smsState === "sent" ? OK : "#FBFAF8",
                  color: smsState === "sent" ? "#FBFAF8" : INK,
                  fontSize: ".9rem",
                  fontWeight: 700,
                  cursor: smsState === "sending" || smsState === "sent" ? "default" : "pointer",
                }}
              >
                {smsState === "sent" ? (
                  <Check size={17} strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <MessageSquareText size={17} strokeWidth={2.5} aria-hidden="true" />
                )}
                {smsState === "sending"
                  ? "Envoi…"
                  : smsState === "sent"
                    ? "Envoyé par SMS"
                    : "Recevoir par SMS"}
              </button>
              <button
                type="button"
                onClick={copyCode}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "11px 8px",
                  border: `2px solid ${INK}`,
                  background: copied ? OK : "#FBFAF8",
                  color: copied ? "#FBFAF8" : INK,
                  fontSize: ".9rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {copied ? (
                  <Check size={17} strokeWidth={2.5} aria-hidden="true" />
                ) : (
                  <Copy size={17} strokeWidth={2.5} aria-hidden="true" />
                )}
                {copied ? "Copié" : "Copier le code"}
              </button>
            </div>
            {smsState === "error" && (
              <p style={{ color: ERR, fontSize: ".78rem", margin: "0 0 12px" }}>
                {smsError || "Envoi SMS impossible. Copiez le code."}
              </p>
            )}

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
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
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
                  <Wifi size={19} strokeWidth={2.5} aria-hidden="true" />
                  {countdown !== null ? "Me connecter maintenant" : "Connecter mon téléphone"}
                </button>
                <p style={{ color: INK_SOFT, fontSize: ".82rem", margin: 0 }}>
                  Ça ne marche pas ? Retournez sur le portail WiFi (onglet <b>Code</b>) et
                  saisissez ce code.{" "}
                  {smsSent && <>Il vous a été envoyé par <b>SMS</b>.</>}
                </p>
              </>
            ) : (
              <p style={{ color: INK_SOFT, fontSize: ".92rem", margin: 0 }}>
                Retournez sur le portail WiFi (onglet <b>Code</b>) et saisissez ce code pour vous
                connecter.{" "}
                {smsSent && <>Il vous a été envoyé par <b>SMS</b>.</>}
              </p>
            )}

            {/* « 2 téléphones, 1 numéro » : racheter un ticket pour un autre
                appareil en un tap (même numéro, sans re-saisie ni OTP). */}
            <button
              type="button"
              onClick={rebuy}
              disabled={rebuyState === "loading"}
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 14,
                padding: "12px 16px",
                border: `2px solid ${INK}`,
                background: PAPER,
                color: INK,
                fontSize: ".95rem",
                fontWeight: 700,
                cursor: rebuyState === "loading" ? "default" : "pointer",
              }}
            >
              <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
              {rebuyState === "loading" ? "Redirection…" : "Acheter un autre ticket"}
            </button>
            <p style={{ color: INK_SOFT, fontSize: ".72rem", margin: "6px 0 0", lineHeight: 1.4 }}>
              Pour connecter un second téléphone avec le même numéro.
            </p>
            {rebuyState === "error" && (
              <p style={{ color: ERR, fontSize: ".78rem", margin: "8px 0 0" }}>
                {rebuyError || "Rachat impossible. Réessayez."}
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
            <RecoverLink slug={slug} />
          </>
        ) : (
          <>
            <style>{`@keyframes slh-spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ marginBottom: 12 }}>
              <Loader2
                size={44}
                color={BRAND}
                style={{ display: "inline-block", animation: "slh-spin 1s linear infinite" }}
              />
            </div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 8px" }}>
              Confirmation du paiement…
            </h1>
            <p style={{ color: INK_SOFT, fontSize: ".95rem", margin: 0, lineHeight: 1.5 }}>
              Votre code WiFi s’affiche <b>ici même</b> dès la confirmation — quelques secondes.
              Il vous est aussi envoyé par <b>SMS</b>. Pas besoin de recharger la page.
            </p>
            <RecoverLink slug={slug} />
          </>
        )}
      </div>
    </main>
  );
}

/** Lien de secours vers la récupération du code par numéro (paiement mobile
 * money terminé sur le téléphone sans retour du navigateur). Affiché sur les
 * états non aboutis de cette page — c'est là que le client stagne. */
function RecoverLink({ slug }: { slug: string }) {
  if (!slug) return null;
  return (
    <p style={{ margin: "16px 0 0", fontSize: ".82rem" }}>
      <a
        href={`/portal/recover?slug=${encodeURIComponent(slug)}`}
        style={{ color: INK, fontWeight: 700, textDecoration: "underline" }}
      >
        Déjà payé ? Retrouver mon code
      </a>
    </p>
  );
}
