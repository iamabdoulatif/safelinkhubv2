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
// Mini-navigateur des portails captifs (CNA iOS / WebView Android) : il ne
// lance pas d'app et window.open y donne about:blank. Le serveur ouvre alors
// une « voie de paiement » (session hotspot restreinte, payment-lane.ts) et la
// page de suivi guide le client vers l'app Wave. Après paiement, un CODE WiFi
// s'affiche (+ SMS) : le client le saisit sur le portail pour se connecter.

import { useEffect, useState } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import { isCaptiveBrowser } from "@/lib/portal/browser-href";
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
  const [copied, setCopied] = useState(false);
  const [captive, setCaptive] = useState(false);

  useEffect(() => {
    // client-only : window absent au rendu serveur.
    const url = window.location.href;
    const ua = navigator.userAgent || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(url);
    setCaptive(isCaptiveBrowser(ua));
  }, []);

  async function pay(method: string) {
    if (busy) return;
    setBusy(method);
    setError("");
    // Navigateur normal : on ouvre une fenêtre VIDE TOUT DE SUITE, dans le geste
    // du tap (sinon iOS la bloque), on la navigue vers le checkout une fois créé,
    // et l'onglet d'origine va sonder /portal/paid.
    //
    // JAMAIS dans le mini-navigateur captif (CNA iOS) : là, window.open
    // n'ouvre PAS Safari — il remplace la vue par about:blank, décharge notre
    // page et le POST /pay n'aboutit pas (RUE-NICOLAS 12/10/2026 : page blanche,
    // commandes restées `pending`). Même fenêtre → checkout ; le webhook
    // GeniusPay + le rattrapage serveur honorent la commande et le code part par
    // SMS, sans page de sondage.
    const win = captive ? null : window.open("", "_blank");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Voie routeur seulement pour Wave : c'est la seule qui lance une app
        // ayant besoin du réseau. Orange/MTN/Moov valident par une demande
        // sur le téléphone (page web + notification), sans app.
        body: JSON.stringify({ orderId, method, theme, captive: captive && method === "wave" }),
      });
      const data = (await res.json()) as {
        checkoutUrl?: string;
        error?: string;
        lane?: boolean;
        smsSent?: boolean;
      };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Paiement impossible. Réessayez.");
      }
      const paidUrl = new URL("/portal/paid", window.location.origin);
      paidUrl.searchParams.set("orderId", orderId);
      paidUrl.searchParams.set("slug", slug);
      paidUrl.searchParams.set("accent", theme.accent);
      paidUrl.searchParams.set("surface", theme.surface);
      paidUrl.searchParams.set("text", theme.text);
      // Voie de paiement ouverte par le routeur : l'app Wave a du réseau et la
      // fenêtre captive va proposer « Terminé ». On reste sur NOTRE page de
      // suivi (consignes + sondage du statut) au lieu de charger le checkout
      // dans un mini-navigateur qui ne sait pas lancer d'app.
      if (data.lane) {
        paidUrl.searchParams.set("lane", "1");
        if (data.smsSent) paidUrl.searchParams.set("sms", "1");
        paidUrl.searchParams.set("pay", data.checkoutUrl);
        window.location.assign(paidUrl);
        return;
      }
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

  // UN tap = paiement lancé. Les 4 opérateurs SONT le choix principal (grille
  // 2×2) : avant, un CTA « Choisir mon moyen de paiement » menait à une
  // seconde page de choix (checkout hébergé) — un écran de plus pour rien.
  // Le checkout hébergé reste accessible en lien discret (carte, autres).
  return (
    <div>
      <p className={styles.payHeading}>Payez avec</p>
      <div className={styles.railGrid}>
        {METHODS.map((m) => {
          const loading = busy === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={`${styles.railTile} ${m.id === "wave" ? styles.railTileFeatured : ""}`}
              disabled={Boolean(busy)}
              aria-busy={loading}
              onClick={() => pay(m.id)}
            >
              {m.id === "wave" ? <span className={styles.railBadge}>Le plus rapide</span> : null}
              <span className={styles.railLogo}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.logo} alt="" />
              </span>
              <span className={styles.railLabel}>{loading ? "Ouverture…" : m.label}</span>
            </button>
          );
        })}
      </div>

      <p className={`${styles.muted}`} style={{ margin: "12px 0 0", fontSize: ".84rem", textAlign: "center", lineHeight: 1.5 }}>
        {captive ? (
          <>
            L’app de votre opérateur s’ouvre (ou une demande de validation arrive sur votre
            téléphone). Votre <b>code Wi-Fi</b> s’affiche ensuite ici et par SMS.
          </>
        ) : (
          <>
            Validez dans l’app ou sur votre téléphone : votre <b>code Wi-Fi</b> s’affiche
            ensuite ici et par SMS.
          </>
        )}
      </p>

      {error ? (
        <p className={styles.error} role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      <div className={styles.secondaryLinks}>
        <button type="button" className={styles.textLink} disabled={Boolean(busy)} onClick={() => pay("hosted")}>
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
        {linkRow}
      </details>

      <p className={`${styles.secureNote} ${styles.muted}`}>Paiement sécurisé via GeniusPay.</p>
    </div>
  );
}
