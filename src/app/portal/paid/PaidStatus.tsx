"use client";

// Sonde l'état de la commande depuis l'onglet du navigateur et expose le
// ticket. La connexion RouterOS reste une action du portail Wi-Fi d'origine.

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import styles from "../PortalExperience.module.css";

type Phase = "loading" | "processing" | "fulfilled" | "failed";

function themeStyle(theme: PortalTheme): CSSProperties {
  return {
    "--portal-accent": theme.accent,
    "--portal-surface": theme.surface,
    "--portal-text": theme.text,
  } as CSSProperties;
}

export default function PaidStatus({
  isError,
  orderId,
  slug,
  theme,
}: {
  isError: boolean;
  orderId: string;
  slug: string;
  theme: PortalTheme;
}) {
  const canPoll = Boolean(orderId && slug) && !isError;
  const [phase, setPhase] = useState<Phase>(isError ? "failed" : canPoll ? "loading" : "processing");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    if (!canPoll) return;
    let active = true;
    let tries = 0;
    let timer: number | undefined;
    const max = 90;

    async function tick() {
      if (!active) return;
      tries += 1;
      try {
        const response = await fetch(
          `/api/portal/${encodeURIComponent(slug)}/status?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as { status?: string; code?: string; error?: string };
        if (!active) return;
        if (data.status === "fulfilled") {
          if (data.code) setCode(data.code);
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
        // Erreur transitoire : on continue de sonder jusqu'à la limite prévue.
      }

      if (active && tries < max) {
        timer = window.setTimeout(tick, 4000);
      }
    }

    timer = window.setTimeout(tick, 800);
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [canPoll, orderId, slug]);

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyMessage("Ticket copié.");
      window.setTimeout(() => setCopyMessage(""), 2000);
    } catch {
      setCopyMessage("Copie indisponible : sélectionnez le ticket manuellement.");
    }
  }

  return (
    <main className={styles.shell} style={themeStyle(theme)}>
      <div className={styles.frame}>
        <div className={styles.statusRow}>
          <span className={styles.brand}>
            <span aria-hidden="true" className={styles.brandMark} /> SafeLinkHub
          </span>
          <span className={styles.statusPill}>Accès Wi-Fi</span>
        </div>
        <section aria-live="polite" className={`${styles.card} ${styles.centered}`}>
          {phase === "fulfilled" ? (
            <>
              <p className={styles.eyebrow}>Paiement confirmé</p>
              <h1 className={styles.title}>Votre ticket Wi-Fi est prêt</h1>
              <p className={styles.copy}>Conservez ce code pour vous connecter au réseau.</p>
              <div className={styles.ticket}>{code || "…"}</div>
              <div className={styles.ticketActions}>
                <button className={styles.primaryButton} disabled={!code} onClick={copyCode} type="button">
                  Copier le ticket
                </button>
                {copyMessage ? <p className={styles.notice}>{copyMessage}</p> : null}
              </div>
              <p className={styles.copy}>
                Retournez sur le portail Wi-Fi et choisissez <strong>« J&apos;ai un code »</strong> avant d&apos;insérer ce ticket.
                Il vous a aussi été envoyé par SMS.
              </p>
            </>
          ) : phase === "failed" ? (
            <>
              <p className={styles.eyebrow}>Paiement non abouti</p>
              <h1 className={styles.title}>Votre achat n&apos;a pas été finalisé</h1>
              <p className={styles.copy}>
                {error || "Revenez au portail Wi-Fi pour reprendre votre achat."}
              </p>
            </>
          ) : (
            <>
              <p className={styles.eyebrow}>{phase === "loading" ? "Paiement reçu" : "Activation en cours"}</p>
              <h1 className={styles.title}>Nous préparons votre accès Wi-Fi</h1>
              <p className={styles.copy}>
                Votre ticket s&apos;affichera ici dès qu&apos;il sera prêt et vous sera également envoyé par SMS.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
