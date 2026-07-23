"use client";

// Saisie du numéro → récupération du code d'accès déjà payé. Thème « Bitume »
// (moutarde/anthracite, bordures 2px, aplats opaques) + icônes lucide, comme
// /portal/paid.

import { useState } from "react";
import { Check, Copy, KeyRound, MessageSquareText, Search, Wifi } from "lucide-react";

const INK = "#1C1917";
const INK_SOFT = "#57534E";
const PAPER = "#FBFAF8";
const CLAY = "#F0EDE6";
const BRAND = "#EAB308";
const OK = "#15803D";
const ERR = "#C2410C";
const MONO = "'SFMono-Regular', Consolas, 'Liberation Mono', monospace";

type Country = { d: string; f: string; n: string };

/** URL de login du hotspot avec le code en identifiant + mot de passe. */
function buildConnectUrl(loginUrl: string, code: string): string {
  const url = new URL(loginUrl);
  url.searchParams.set("username", code);
  url.searchParams.set("password", code);
  url.searchParams.set("dst", loginUrl.replace(/\/login$/, "/status"));
  return url.toString();
}

export default function RecoverCode({
  slug,
  defaultDial,
  countries,
}: {
  slug: string;
  defaultDial: string;
  countries: Country[];
}) {
  const [phone, setPhone] = useState("");
  const [dial, setDial] = useState(defaultDial || (countries[0]?.d ?? ""));
  const [state, setState] = useState<"idle" | "searching" | "found" | "pending" | "notfound">("idle");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [smsState, setSmsState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function search() {
    const local = phone.replace(/[^0-9]/g, "");
    if (local.length < 7) {
      setError("Numéro invalide.");
      return;
    }
    setState("searching");
    setError("");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/recover-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: local, dialCode: dial }),
      });
      const data = (await res.json()) as {
        found?: boolean;
        ready?: boolean;
        code?: string;
        orderId?: string;
        loginUrl?: string | null;
        smsSent?: boolean;
        pendingPayment?: boolean;
        error?: string;
      };
      if (res.status === 429) {
        setState("idle");
        setError(data.error || "Trop d'essais. Réessayez plus tard.");
        return;
      }
      if (!data.found) {
        setState("notfound");
        return;
      }
      if (!data.ready) {
        setState("pending");
        return;
      }
      setCode(data.code || "");
      setOrderId(data.orderId || "");
      setLoginUrl(data.loginUrl ?? null);
      if (data.smsSent) setSmsState("sent");
      setState("found");
    } catch {
      setState("idle");
      setError("Connexion au serveur impossible. Restez sur le portail WiFi et réessayez.");
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

  async function requestSms() {
    if (!orderId || smsState === "sending" || smsState === "sent") return;
    setSmsState("sending");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/ticket-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await res.json()) as { sent?: boolean };
      if (!res.ok || !data.sent) throw new Error();
      setSmsState("sent");
    } catch {
      setSmsState("error");
    }
  }

  function connectNow() {
    if (loginUrl && code) window.location.assign(buildConnectUrl(loginUrl, code));
  }

  const card: React.CSSProperties = {
    maxWidth: 380,
    width: "100%",
    background: PAPER,
    border: `2px solid ${INK}`,
    padding: 28,
  };

  // ── Écran : code retrouvé ─────────────────────────────────────────────
  if (state === "found") {
    return (
      <div style={{ ...card, textAlign: "center" }}>
        <div style={{ marginBottom: 8 }}>
          <KeyRound size={40} color={OK} style={{ display: "inline-block" }} />
        </div>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 800, margin: "0 0 6px" }}>Code retrouvé</h1>
        <p style={{ color: INK_SOFT, fontSize: ".72rem", fontFamily: MONO, textTransform: "uppercase", letterSpacing: ".12em", margin: "0 0 6px" }}>
          Votre code WiFi
        </p>
        <button
          type="button"
          onClick={copyCode}
          title="Toucher pour copier"
          style={{ display: "block", width: "100%", fontSize: "2rem", fontWeight: 700, fontFamily: MONO, letterSpacing: ".18em", color: INK, background: CLAY, border: `2px solid ${INK}`, padding: "10px 8px", margin: "0 0 12px", cursor: "pointer" }}
        >
          {code || "…"}
        </button>
        <div style={{ display: "flex", gap: 8, margin: "0 0 12px" }}>
          <button
            type="button"
            onClick={requestSms}
            disabled={smsState === "sending" || smsState === "sent"}
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 8px", border: `2px solid ${INK}`, background: smsState === "sent" ? OK : PAPER, color: smsState === "sent" ? PAPER : INK, fontSize: ".9rem", fontWeight: 700, cursor: smsState === "sending" || smsState === "sent" ? "default" : "pointer" }}
          >
            {smsState === "sent" ? <Check size={17} strokeWidth={2.5} /> : <MessageSquareText size={17} strokeWidth={2.5} />}
            {smsState === "sending" ? "Envoi…" : smsState === "sent" ? "Envoyé par SMS" : "Recevoir par SMS"}
          </button>
          <button
            type="button"
            onClick={copyCode}
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 8px", border: `2px solid ${INK}`, background: copied ? OK : PAPER, color: copied ? PAPER : INK, fontSize: ".9rem", fontWeight: 700, cursor: "pointer" }}
          >
            {copied ? <Check size={17} strokeWidth={2.5} /> : <Copy size={17} strokeWidth={2.5} />}
            {copied ? "Copié" : "Copier le code"}
          </button>
        </div>
        {loginUrl && code && (
          <button
            type="button"
            onClick={connectNow}
            style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 16px", border: `2px solid ${INK}`, background: BRAND, color: INK, fontSize: "1rem", fontWeight: 800, cursor: "pointer" }}
          >
            <Wifi size={19} strokeWidth={2.5} />
            Connecter mon téléphone
          </button>
        )}
        <p style={{ color: INK_SOFT, fontSize: ".82rem", margin: "12px 0 0" }}>
          Ou retournez sur le portail WiFi (onglet <b>Code</b>) et saisissez ce code.
        </p>
      </div>
    );
  }

  // ── Écran : saisie du numéro (+ états pending / introuvable) ───────────
  return (
    <div style={card}>
      <h1 style={{ fontSize: "1.2rem", fontWeight: 800, margin: "0 0 4px" }}>Retrouver mon code</h1>
      <p style={{ color: INK_SOFT, fontSize: ".9rem", margin: "0 0 16px" }}>
        Déjà payé ? Saisissez le numéro utilisé pour l&rsquo;achat.
      </p>

      <label style={{ display: "block", fontSize: ".8rem", margin: "0 0 6px" }}>Votre numéro</label>
      <div style={{ display: "flex", gap: 6, margin: "0 0 4px" }}>
        {countries.length > 0 && (
          <select
            value={dial}
            onChange={(e) => setDial(e.target.value)}
            title="Pays du numéro"
            style={{ maxWidth: 118, padding: "0 6px", border: `1px solid #CBD5E1`, background: "#F8FAFC", fontSize: ".95rem" }}
          >
            {countries.map((c) => (
              <option key={c.d + c.n} value={c.d}>
                {(c.f ? c.f + " " : "") + c.d}
              </option>
            ))}
          </select>
        )}
        <input
          type="tel"
          inputMode="numeric"
          placeholder="07 00 00 00 00"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "11px 12px", border: `1px solid #CBD5E1`, fontSize: "1rem" }}
        />
      </div>

      {state === "notfound" && (
        <p style={{ color: ERR, fontSize: ".82rem", margin: "8px 0 0" }}>
          Aucune commande trouvée pour ce numéro (dernières 24 h). Vérifiez l&rsquo;indicatif et le numéro.
        </p>
      )}
      {state === "pending" && (
        <p style={{ color: INK_SOFT, fontSize: ".82rem", margin: "8px 0 0" }}>
          Un paiement est en cours de confirmation. Patientez un instant puis réessayez.
        </p>
      )}
      {error && <p style={{ color: ERR, fontSize: ".82rem", margin: "8px 0 0" }}>{error}</p>}

      <button
        type="button"
        onClick={search}
        disabled={state === "searching"}
        style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 16px", margin: "16px 0 0", border: `2px solid ${INK}`, background: BRAND, color: INK, fontSize: "1rem", fontWeight: 800, cursor: state === "searching" ? "default" : "pointer" }}
      >
        <Search size={19} strokeWidth={2.5} />
        {state === "searching" ? "Recherche…" : "Retrouver mon code"}
      </button>
    </div>
  );
}
