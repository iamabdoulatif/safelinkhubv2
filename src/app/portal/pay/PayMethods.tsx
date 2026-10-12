"use client";

// Choix du moyen de paiement (page hébergée /portal/pay). Un clic crée la
// transaction GeniusPay du rail choisi (POST /api/portal/[slug]/pay) puis
// redirige la MÊME fenêtre vers le checkout du rail.
//
// La page LISTE chaque moyen (Wave, Orange, MTN, Moov, carte) comme le checkout
// GeniusPay : un clic initie le paiement sur CE rail précis (payment_method
// envoyé à /api/portal/[slug]/pay → GeniusPay renvoie l'URL du rail). Un lien
// « tous les moyens » ouvre en repli le checkout hébergé (payment_method omis)
// si un rail précis n'est pas activé côté marchand GeniusPay. Les domaines de
// redirection de chaque opérateur doivent être autorisés dans le walled-garden
// (Paramètres → Walled-garden) pour s'ouvrir derrière le portail.
//
// Le mini-navigateur des portails captifs (CNA iOS / Android) gère mal les SPA
// lourdes (checkout Wave/GeniusPay « pompe sur le logo ») et IGNORE window.open.
// D'où le lien de sortie (browserHref : x-safari-https:// / intent://) qui
// ouvre /portal/pay dans le vrai navigateur, où le checkout marche. Après
// paiement, un CODE WiFi s'affiche (+ SMS) : le client le saisit sur le portail.

import { useEffect, useState } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import { browserHref, isCaptiveBrowser } from "@/lib/portal/browser-href";
import styles from "../PortalExperience.module.css";

type Method = { id: string; label: string; logo: string };

// Liste des moyens affichés (logo + nom). Depuis le 2026-07-23, GeniusPay route
// TOUT rail forcé sauf Wave vers checkout.paystack.com (canal marchand cassé :
// « transaction pas valide / déjà effectuée ») — vérifié en créant une
// transaction test par rail. Le serveur (/api/portal/[slug]/pay) ne force donc
// plus que "wave" ; tout autre choix ouvre le checkout HÉBERGÉ GeniusPay
// (geniuspay.ci/checkout, payment_method omis — « Checkout Mode (Recommended) »
// de la doc), où le client retrouve son opérateur et où le routage est correct.
const METHODS: Method[] = [
  { id: "wave", label: "Wave", logo: "/payment/wave.png" },
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
  const [exitHref, setExitHref] = useState("");
  const [copied, setCopied] = useState(false);
  const [captive, setCaptive] = useState(false);

  useEffect(() => {
    // client-only : window absent au rendu serveur.
    const url = window.location.href;
    const ua = navigator.userAgent || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(url);
    setExitHref(browserHref(url, ua));
    setCaptive(isCaptiveBrowser(ua));
  }, []);

  async function pay(method: string) {
    if (busy) return;
    setBusy(method);
    setError("");
    // On ouvre une fenêtre VIDE TOUT DE SUITE, dans le geste du tap : sur iPhone,
    // le mini-navigateur du portail captif (CNA) ne sait pas gérer d'onglet, donc
    // il DÉLÈGUE à Safari — le paiement (Paystack/3DS) s'y ouvre correctement,
    // contrairement au CNA bridé. On la navigue vers le checkout une fois celui-ci
    // créé. Impératif : le window.open doit précéder le fetch (async), sinon iOS
    // le considère hors-geste et le bloque. Si l'ouverture est bloquée (null) →
    // repli même-fenêtre : aucune régression vs l'ancien comportement.
    const win = window.open("", "_blank");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, method, theme }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Paiement impossible. Réessayez.");
      }
      const paidUrl = new URL("/portal/paid", window.location.origin);
      paidUrl.searchParams.set("orderId", orderId);
      paidUrl.searchParams.set("slug", slug);
      paidUrl.searchParams.set("accent", theme.accent);
      paidUrl.searchParams.set("surface", theme.surface);
      paidUrl.searchParams.set("text", theme.text);
      if (win && !win.closed) {
        win.location.href = data.checkoutUrl; // Safari (nouvel onglet) → checkout OK
        // GeniusPay v3 ne redirige PAS vers success_url après paiement (le client
        // reste bloqué sur geniuspay.ci). On envoie donc l'onglet D'ORIGINE (sur
        // notre domaine, derrière le walled-garden) sonder le statut : c'est CE
        // sondage qui déclenche la fulfillment, lance l'auto-login et AFFICHE le
        // code — indépendamment du retour de geniuspay.ci.
        window.location.assign(paidUrl);
      } else {
        window.location.assign(data.checkoutUrl); // fenêtre bloquée → même fenêtre
      }
    } catch (e) {
      if (win && !win.closed) win.close();
      setBusy(null);
      setError(e instanceof Error ? e.message : "Erreur réseau. Réessayez.");
    }
  }

  async function copyLink() {
    const url = pageUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible : le champ reste sélectionnable à la main */
    }
  }

  // Un VRAI lien : window.open est ignoré par le CNA iOS, un <a href> vers un
  // schéma système (x-safari-https://) est transmis au système.
  const exitLink = (label: string, className: string) => (
    <a className={className} href={exitHref || pageUrl || "#"}>
      {label}
    </a>
  );

  const linkRow = (
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
  );

  return (
    <div>
      {/* ── Portail captif détecté : pousser le vrai navigateur EN PREMIER ──
          Le mini-navigateur (CNA iOS / WebView Android) fait échouer la plupart
          des checkouts. On met donc l'ouverture navigateur en tête, bien visible,
          AVANT les moyens de paiement — c'est le chemin fiable. */}
      {captive ? (
        <section className={styles.captiveBox} aria-labelledby="slh-captive-title">
          <h2 id="slh-captive-title">Payez dans Safari ou Chrome</h2>
          <p className={`${styles.copy} ${styles.muted}`} style={{ margin: 0, fontSize: ".88rem" }}>
            Cette fenêtre Wi-Fi bloque le paiement. Appuyez ci-dessous : votre navigateur
            s’ouvre sur cette page, vous payez, puis votre <b>code Wi-Fi</b> s’affiche (et
            arrive par SMS).
          </p>
          {exitLink("Ouvrir dans mon navigateur", `${styles.primaryButton} ${styles.ctaButton}`)}
          <p className={`${styles.muted}`} style={{ margin: 0, fontSize: ".76rem" }}>
            Si rien ne s’ouvre : copiez le lien, choisissez « Utiliser sans Internet » puis
            collez-le dans Chrome ou Safari.
          </p>
          {linkRow}
        </section>
      ) : null}

      {/* CTA principal : le checkout hébergé GeniusPay (payment_method omis)
          — la page qui liste tous les moyens ET permet d'en CHANGER en cours
          de route. Les rails directs restent en raccourcis ci-dessous. */}
      <button
        type="button"
        className={`${styles.primaryButton} ${captive ? "" : styles.ctaButton}`}
        onClick={() => pay("hosted")}
        disabled={Boolean(busy)}
        style={{ width: "100%" }}
      >
        {busy === "hosted" ? "Redirection…" : "Choisir mon moyen de paiement"}
      </button>
      <p className={styles.muted} style={{ margin: "8px 0 0", fontSize: ".78rem", textAlign: "center" }}>
        Wave, Orange Money, MTN MoMo, Moov Money, carte — changez de moyen à tout
        moment sur la page sécurisée.
      </p>

      <p className={styles.divider}>Ou commencer avec</p>
      <div className={styles.methodList}>
        {METHODS.map((m) => {
          const loading = busy === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={styles.methodButton}
              disabled={Boolean(busy)}
              onClick={() => pay(m.id)}
            >
              <span className={styles.methodLogo}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.logo} alt="" />
              </span>
              <span>{loading ? "Redirection…" : m.label}</span>
              <span aria-hidden="true" style={{ fontSize: "1.3rem", lineHeight: 1 }}>
                ›
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className={styles.error} role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      {/* Repli (hors portail captif détecté, ou si la détection a raté) :
          ouvrir la page dans le vrai navigateur. */}
      {captive ? null : (
        <div className={styles.browserFallback}>
          <p className={`${styles.muted}`} style={{ margin: 0, fontSize: ".84rem", lineHeight: 1.5 }}>
            La page de paiement reste bloquée sur le logo ? Ouvrez cette page dans{" "}
            <b>Chrome</b> ou <b>Safari</b> pour payer, puis revenez saisir votre code.
          </p>
          {exitLink("Ouvrir dans mon navigateur", styles.secondaryButton)}
          {linkRow}
        </div>
      )}

      <p className={`${styles.secureNote} ${styles.muted}`}>
        Paiement sécurisé via GeniusPay. Après le paiement, un <b>code Wi-Fi</b> s’affiche :
        saisissez-le sur le portail Wi-Fi pour vous connecter.
      </p>

      {/* Repli mobile money : un client dont le paiement s'est terminé sur le
          téléphone (navigateur non revenu) retrouve son code par son numéro. */}
      <p style={{ margin: "10px 0 0", fontSize: ".86rem", textAlign: "center" }}>
        <a
          href={`/portal/recover?slug=${encodeURIComponent(slug)}`}
          style={{ color: "inherit", fontWeight: 700 }}
        >
          Déjà payé ? Retrouver mon code
        </a>
      </p>
    </div>
  );
}
