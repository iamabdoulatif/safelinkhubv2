"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import styles from "../PortalExperience.module.css";

type Step = "phone" | "otp";
type BusyState = "send" | "verify" | "initiate" | null;
type ApiReply = { status?: string; verified?: boolean; to?: string; payUrl?: string; error?: string };

function fcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

function themeStyle(theme: PortalTheme): CSSProperties {
  return {
    "--portal-accent": theme.accent,
    "--portal-surface": theme.surface,
    "--portal-text": theme.text,
  } as CSSProperties;
}

async function responseJson(response: Response): Promise<ApiReply> {
  return (await response.json().catch(() => ({}))) as ApiReply;
}

export default function PurchaseFlow({
  slug,
  packageId,
  packageName,
  priceCents,
  routerId,
  mac,
  theme,
}: {
  slug: string;
  packageId: string;
  packageName: string;
  priceCents: number;
  routerId: string;
  mac: string;
  theme: PortalTheme;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<BusyState>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function initiatePurchase() {
    setBusy("initiate");
    setError("");
    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(slug)}/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, phone, mac, routerId, theme }),
      });
      const data = await responseJson(response);
      if (!response.ok || !data.payUrl) {
        throw new Error(data.error || "Impossible de préparer le paiement.");
      }
      window.location.assign(data.payUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur réseau. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function sendOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy("send");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(slug)}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await responseJson(response);
      if (!response.ok) {
        throw new Error(data.error || "Impossible d'envoyer le code.");
      }
      if (data.status === "verified") {
        setNotice("Ce numéro est déjà vérifié. Préparation du paiement…");
        await initiatePurchase();
        return;
      }
      if (data.status !== "sent") {
        throw new Error(data.error || "Impossible d'envoyer le code.");
      }
      setStep("otp");
      setNotice(data.to ? `Code envoyé au ${data.to}.` : "Code envoyé par SMS.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur réseau. Réessayez.");
    } finally {
      setBusy((current) => (current === "send" ? null : current));
    }
  }

  async function verifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy("verify");
    setError("");
    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(slug)}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await responseJson(response);
      if (!response.ok || !data.verified) {
        throw new Error(data.error || "Code incorrect. Réessayez.");
      }
      setNotice("Numéro vérifié. Préparation du paiement…");
      await initiatePurchase();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur réseau. Réessayez.");
    } finally {
      setBusy((current) => (current === "verify" ? null : current));
    }
  }

  return (
    <main className={styles.shell} style={themeStyle(theme)}>
      <div className={styles.frame}>
        <div className={styles.statusRow}>
          <span className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark} /> SafeLinkHub
          </span>
          <span className={styles.statusPill}>Connexion sécurisée</span>
        </div>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Achat Wi-Fi</p>
          <h1 className={styles.title}>Confirmez votre numéro</h1>
          <p className={styles.copy}>
            Nous vérifions votre numéro par SMS avant de vous diriger vers le paiement sécurisé.
          </p>

          <div className={styles.planSummary}>
            <p className={styles.planLabel}>Forfait sélectionné</p>
            <p className={styles.planName}>{packageName}</p>
            <p className={styles.planPrice}>{fcfa(priceCents)}</p>
          </div>

          {step === "phone" ? (
            <form className={styles.form} onSubmit={sendOtp}>
              <p className={styles.steps}>
                <span className={styles.stepNumber}>1</span>
                Entrez le numéro sur lequel recevoir votre code de vérification.
              </p>
              <label className={styles.fieldLabel}>
                Numéro de téléphone
                <input
                  autoComplete="tel"
                  className={styles.input}
                  disabled={Boolean(busy)}
                  inputMode="tel"
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Ex. 07 00 00 00 00"
                  required
                  type="tel"
                  value={phone}
                />
              </label>
              <button className={styles.primaryButton} disabled={Boolean(busy)} type="submit">
                {busy === "send" ? "Envoi du code…" : "Recevoir mon code SMS"}
              </button>
            </form>
          ) : (
            <form className={styles.form} onSubmit={verifyOtp}>
              <p className={styles.steps}>
                <span className={styles.stepNumber}>2</span>
                Saisissez le code reçu par SMS pour continuer vers le paiement.
              </p>
              <label className={styles.fieldLabel}>
                Code de vérification
                <input
                  autoComplete="one-time-code"
                  className={styles.input}
                  disabled={Boolean(busy)}
                  inputMode="numeric"
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  pattern="[0-9]*"
                  placeholder="000000"
                  required
                  type="text"
                  value={code}
                />
              </label>
              <button className={styles.primaryButton} disabled={Boolean(busy)} type="submit">
                {busy === "verify" || busy === "initiate" ? "Vérification…" : "Continuer au paiement"}
              </button>
              <button
                className={styles.secondaryButton}
                disabled={Boolean(busy)}
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError("");
                }}
                type="button"
              >
                Modifier mon numéro
              </button>
            </form>
          )}

          <div aria-live="polite">
            {notice ? <p className={styles.notice}>{notice}</p> : null}
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
          <p className={styles.secureNote}>Votre numéro sert uniquement à vérifier et suivre cet achat Wi-Fi.</p>
        </section>
      </div>
    </main>
  );
}
