"use client";

// Le choix est fait sur la page SafeLinkHub afin que la redirection vers Wave
// ou Paystack reste fiable hors du mini-navigateur du portail captif.

import { useEffect, useState } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import styles from "../PortalExperience.module.css";

type Method = { id: string; label: string; detail: string };

const METHODS: Method[] = [
  { id: "wave", label: "Payer avec Wave", detail: "Mobile Money" },
  { id: "paystack", label: "Carte bancaire", detail: "Visa ou Mastercard" },
];

type PaymentReply = { checkoutUrl?: string; error?: string };

export default function PayMethods({
  slug,
  orderId,
  theme,
}: {
  slug: string;
  orderId: string;
  theme: PortalTheme;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Client-only : aucun accès au navigateur pendant le rendu serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(window.location.href);
  }, []);

  async function pay(method: string) {
    if (busy) return;
    setBusy(method);
    setError("");
    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(slug)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, method, theme }),
      });
      const data = (await response.json().catch(() => ({}))) as PaymentReply;
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Paiement impossible. Réessayez.");
      }
      window.location.assign(data.checkoutUrl);
    } catch (cause) {
      setBusy(null);
      setError(cause instanceof Error ? cause.message : "Erreur réseau. Réessayez.");
    }
  }

  function openInBrowser() {
    window.open(pageUrl || window.location.href, "_blank", "noopener,noreferrer");
  }

  async function copyLink() {
    const url = pageUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie indisponible ici. Maintenez le lien pour le sélectionner.");
    }
  }

  return (
    <div>
      <div className={styles.methodList}>
        {METHODS.map((method) => {
          const loading = busy === method.id;
          return (
            <button
              className={styles.methodButton}
              disabled={Boolean(busy)}
              key={method.id}
              onClick={() => pay(method.id)}
              type="button"
            >
              <span>{loading ? "Redirection…" : method.label}</span>
              <span>{method.detail}</span>
            </button>
          );
        })}
      </div>

      <div aria-live="polite">{error ? <p className={styles.error}>{error}</p> : null}</div>

      <section className={styles.browserFallback}>
        <p className={styles.copy}>
          Si le paiement reste bloqué, ouvrez cette page dans Safari, Chrome ou votre navigateur habituel.
        </p>
        <button className={styles.secondaryButton} onClick={openInBrowser} type="button">
          Ouvrir dans mon navigateur
        </button>
        <div className={styles.linkRow}>
          <input
            aria-label="Lien de paiement"
            className={styles.linkInput}
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={pageUrl}
          />
          <button className={styles.copyButton} onClick={copyLink} type="button">
            {copied ? "Copié" : "Copier le lien"}
          </button>
        </div>
      </section>

      <p className={styles.secureNote}>
        Paiement sécurisé via GeniusPay. Après paiement, votre ticket Wi-Fi s&apos;affichera ici et sera envoyé par SMS.
      </p>
    </div>
  );
}
