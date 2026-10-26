"use client";

// Paiement du portail (page hébergée /portal/pay). Un bouton par opérateur :
//  • Wave → rail Wave GeniusPay, redirigé sur le LIEN UNIVERSEL qr.pay.wave.com
//    (page Wave : QR + « Continuer »), jamais pay.wave.com.
//  • Orange / MTN / Moov → rail PawaPay (PUSH direct sur le téléphone) dès que
//    GeniusPay a activé les dépôts ; tant que non, repli automatique PaiementPro
//    (page opérateur : OTP/Flash QR Orange, form+push MTN/Moov). Voir le routage
//    serveur dans /api/portal/[slug]/pay.
//  • « Carte bancaire ou autre moyen » → checkout hébergé GeniusPay.
// L'argent va sur le compte GeniusPay de l'org (per-org). Code sur /portal/paid + SMS.

import { useEffect, useState } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import { waveQrHref } from "@/lib/portal/browser-href";
import styles from "../PortalExperience.module.css";

type Method = { id: string; label: string; logo: string; badge?: boolean };

const METHODS: Method[] = [
  { id: "wave", label: "Wave", logo: "/payment/wave.png", badge: true },
  { id: "orange_money", label: "Orange Money", logo: "/payment/orange.png" },
  { id: "mtn_money", label: "MTN MoMo", logo: "/payment/mtn-momo.png" },
  { id: "moov_money", label: "Moov Money", logo: "/payment/moov.png" },
];

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(window.location.href);
  }, []);

  async function pay(method: string) {
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
      // Wave : lien universel qr.pay.wave.com. Autres : URL de checkout telle
      // quelle (push PawaPay / page PaiementPro / checkout hébergé).
      const target =
        method === "wave" ? (waveQrHref(data.checkoutUrl) ?? data.checkoutUrl) : data.checkoutUrl;
      window.location.assign(target);
    } catch (e) {
      setBusy(null);
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
      <p className={styles.payHeading}>Moyen de paiement</p>

      <ul className={styles.selectMenu} role="list" style={{ position: "static", margin: 0 }}>
        {METHODS.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className={styles.selectOption}
              disabled={Boolean(busy)}
              onClick={() => void pay(m.id)}
              style={{ width: "100%" }}
            >
              <span className={styles.selectLogo}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.logo} alt="" />
              </span>
              <span className={styles.selectLabel}>
                {busy === m.id ? `${m.label} — ouverture…` : m.label}
              </span>
              {m.badge ? <span className={styles.selectBadge}>Le plus rapide</span> : null}
              {busy === m.id ? (
                <span aria-hidden="true" className={styles.paySpinner} style={{ marginLeft: "auto" }} />
              ) : null}
            </button>
          </li>
        ))}
      </ul>

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
        <button
          type="button"
          className={styles.textLink}
          disabled={Boolean(busy)}
          onClick={() => void pay("hosted")}
        >
          {busy === "hosted" ? "Ouverture…" : "Carte bancaire ou autre moyen"}
        </button>
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
