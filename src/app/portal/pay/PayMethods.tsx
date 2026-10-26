"use client";

// Paiement du portail (page hébergée /portal/pay). UN seul bouton « Payer » qui
// crée la transaction GeniusPay (sans rail forcé) et envoie le client vers le
// checkout HÉBERGÉ GeniusPay (geniuspay.ci) : il y choisit lui-même son
// opérateur (Wave, Orange, MTN, Moov, carte) et paie. L'argent va sur le compte
// GeniusPay de l'org (per-org), et la page est joignable derrière le portail
// captif (geniuspay.ci est dans le walled-garden) — aucun besoin d'ouvrir une
// app, ce que la fenêtre Wi-Fi iOS (CNA) interdit de toute façon. Après
// paiement, GeniusPay revient sur /portal/paid et le code Wi-Fi s'y affiche
// (+ SMS via le webhook).

import { useEffect, useState } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import styles from "../PortalExperience.module.css";

function fcfa(cents: number): string {
  return `${(cents || 0).toLocaleString("fr-FR")} FCFA`;
}

export default function PayMethods({
  slug,
  orderId,
  theme,
  priceCents = 0,
}: {
  slug: string;
  orderId: string;
  theme: PortalTheme;
  priceCents?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // client-only : window absent au rendu serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(window.location.href);
  }, []);

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // method "hosted" = aucun rail forcé → GeniusPay renvoie son checkout
        // hébergé où le client choisit son opérateur. Pas de voie de paiement
        // (captive omis) : geniuspay.ci passe par le walled-garden.
        body: JSON.stringify({ orderId, method: "hosted", theme }),
      });
      // Réponse non-JSON (page d'erreur d'un proxy) : message lisible.
      const data = (await res.json().catch(() => ({
        error: "Le service de paiement ne répond pas. Réessayez dans un instant.",
      }))) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Paiement impossible. Réessayez.");
      }
      // Même fenêtre → checkout GeniusPay. Au retour (success_url), /portal/paid
      // sonde le statut et affiche le code ; le webhook + le SMS honorent la
      // commande même si le client ne revient pas de lui-même.
      window.location.assign(data.checkoutUrl);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Erreur réseau. Réessayez.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl || window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible : le champ reste sélectionnable à la main */
    }
  }

  return (
    <div>
      <button
        type="button"
        className={styles.primaryButton}
        disabled={busy}
        onClick={() => void pay()}
      >
        {busy ? "Ouverture du paiement sécurisé…" : `Payer ${fcfa(priceCents)}`}
      </button>

      <p
        className={styles.muted}
        style={{ margin: "12px 0 0", fontSize: ".9rem", textAlign: "center", lineHeight: 1.5 }}
      >
        Choisissez <b>Wave, Orange, MTN, Moov</b> ou carte sur la page sécurisée. Votre{" "}
        <b>code Wi-Fi</b> s’affiche ensuite ici et par <b>SMS</b>.
      </p>

      {error ? (
        <p className={styles.error} role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      <div className={styles.secondaryLinks}>
        <a className={styles.textLink} href={`/portal/recover?slug=${encodeURIComponent(slug)}`}>
          Déjà payé ? Retrouver mon code
        </a>
      </div>

      {/* Repli rare : rouvrir cette page dans Chrome/Safari. Replié par défaut. */}
      <details className={styles.fallbackDetails}>
        <summary>La page ne réagit pas ?</summary>
        <p className={styles.muted} style={{ margin: "8px 0", fontSize: ".82rem", lineHeight: 1.5 }}>
          Copiez ce lien et ouvrez-le dans <b>Chrome</b> ou <b>Safari</b>.
        </p>
        <div className={styles.linkRow}>
          <input
            readOnly
            aria-label="Lien de cette page"
            className={styles.linkInput}
            value={pageUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className={styles.copyButton} onClick={copyLink}>
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      </details>

      <p className={`${styles.secureNote} ${styles.muted}`}>Paiement sécurisé via GeniusPay.</p>
    </div>
  );
}
