"use client";

// Paiement du portail (page hébergée /portal/pay). Deux chemins :
//  • « Payer avec Wave » → rail Wave GeniusPay, mais on envoie le client sur le
//    LIEN UNIVERSEL qr.pay.wave.com (page Wave avec QR + « Continuer votre
//    paiement »), PAS pay.wave.com (qui tente d'ouvrir l'app et échoue dans la
//    fenêtre Wi-Fi iOS). C'est le comportement demandé.
//  • « Orange, MTN, Moov ou carte » → checkout HÉBERGÉ GeniusPay (geniuspay.ci),
//    où le client choisit son opérateur. Flux OTP/push, sans app — marche dans
//    la fenêtre captive (geniuspay.ci est dans le walled-garden).
// L'argent va sur le compte GeniusPay de l'org (per-org). Le code s'affiche sur
// /portal/paid au retour + par SMS (webhook).

import { useEffect, useState } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import { waveQrHref } from "@/lib/portal/browser-href";
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
  const [busy, setBusy] = useState<"" | "wave" | "hosted">("");
  const [error, setError] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // client-only : window absent au rendu serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(window.location.href);
  }, []);

  async function pay(method: "wave" | "hosted") {
    if (busy) return;
    setBusy(method);
    setError("");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, method, theme }),
      });
      const data = (await res.json().catch(() => ({
        error: "Le service de paiement ne répond pas. Réessayez dans un instant.",
      }))) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Paiement impossible. Réessayez.");
      }
      // Wave : on force le lien universel qr.pay.wave.com. Autres : checkout
      // GeniusPay tel quel. Même fenêtre ; au retour /portal/paid affiche le code.
      const target =
        method === "wave" ? (waveQrHref(data.checkoutUrl) ?? data.checkoutUrl) : data.checkoutUrl;
      window.location.assign(target);
    } catch (e) {
      setBusy("");
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
        disabled={Boolean(busy)}
        onClick={() => void pay("wave")}
      >
        {busy === "wave" ? "Ouverture de Wave…" : `Payer ${fcfa(priceCents)} avec Wave`}
      </button>

      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => void pay("hosted")}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "13px 16px",
          border: "2px solid var(--portal-text, #10160F)",
          borderRadius: 12,
          background: "var(--portal-surface, #FFFFFF)",
          color: "var(--portal-text, #10160F)",
          fontSize: "1rem",
          fontWeight: 700,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy === "hosted" ? "Ouverture…" : "Orange, MTN, Moov ou carte"}
      </button>

      <p
        className={styles.muted}
        style={{ margin: "12px 0 0", fontSize: ".9rem", textAlign: "center", lineHeight: 1.5 }}
      >
        Validez le paiement, puis revenez ici : votre <b>code Wi-Fi</b> s’affiche tout seul (et par{" "}
        <b>SMS</b>).
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
