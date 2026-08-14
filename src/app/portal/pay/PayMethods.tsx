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
// lourdes (checkout Wave/GeniusPay « pompe sur le logo »). D'où le repli « ouvrir
// dans le navigateur » : /portal/pay est sur safelinkhub.io (walled-garden) donc
// s'ouvre AUSSI dans Chrome/Safari où le checkout marche. Après paiement, un
// CODE WiFi s'affiche (+ SMS) : le client le saisit sur le portail pour se
// connecter.

import { useEffect, useState } from "react";
import type { PortalTheme } from "@/lib/portal/theme";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(window.location.href);
    // Détection du mini-navigateur de portail captif (CNA). Sur iOS le CNA
    // s'annonce « CaptiveNetworkSupport » OU se distingue de Safari par l'absence
    // de « Safari » dans l'UA (WebView-like). Sur Android, l'appli de connexion
    // WiFi est une WebView (« ; wv »). Dans ces contextes, les checkouts de
    // paiement (Wave/GeniusPay/3DS) échouent souvent (« pompe sur le logo ») →
    // on pousse d'emblée l'ouverture dans le vrai navigateur.
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const iosCaptive = isIOS && (/CaptiveNetworkSupport/i.test(ua) || !/Safari/i.test(ua));
    const androidCaptive = /Android/i.test(ua) && /;\s*wv\)/i.test(ua);
    setCaptive(iosCaptive || androidCaptive);
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

  function openInBrowser() {
    const url = pageUrl || window.location.href;
    window.open(url, "_blank");
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

  return (
    <div>
      {/* ── Portail captif détecté : pousser le vrai navigateur EN PREMIER ──
          Le mini-navigateur (CNA iOS / WebView Android) fait échouer la plupart
          des checkouts. On met donc l'ouverture navigateur en tête, bien visible,
          AVANT les moyens de paiement — c'est le chemin fiable. */}
      {captive ? (
        <div
          style={{
            margin: "0 0 16px",
            padding: "14px 14px 16px",
            border: "2px solid #1C1917",
            background: "#FEF3C7",
          }}
        >
          <p style={{ margin: "0 0 4px", fontSize: ".95rem", fontWeight: 800, color: "#1C1917" }}>
            Pour payer, ouvrez dans votre navigateur
          </p>
          <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#57534E", lineHeight: 1.5 }}>
            La fenêtre WiFi bloque souvent le paiement. Ouvrez cette page dans{" "}
            <b>Chrome</b> ou <b>Safari</b>, payez, puis un <b>code WiFi</b> s’affiche (aussi par SMS).
          </p>
          <button
            type="button"
            onClick={openInBrowser}
            style={{
              width: "100%",
              padding: 13,
              border: "2px solid #1C1917",
              background: "#1C1917",
              color: "#FBFAF8",
              fontSize: "1rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Ouvrir dans mon navigateur
          </button>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              readOnly
              value={pageUrl}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "9px 10px",
                border: "1px solid #D8D2C6",
                fontSize: ".78rem",
                color: "#57534E",
                background: "#FBFAF8",
              }}
            />
            <button
              type="button"
              onClick={copyLink}
              style={{
                padding: "9px 12px",
                border: "1px solid #D8D2C6",
                background: "#FBFAF8",
                color: "#1C1917",
                fontSize: ".8rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: ".72rem", color: "#57534E", textAlign: "center" }}>
            Ou continuez ci-dessous (peut ne pas aboutir dans la fenêtre WiFi).
          </p>
        </div>
      ) : null}

      {/* CTA principal : le checkout hébergé GeniusPay (payment_method omis)
          — la page qui liste tous les moyens ET permet d'en CHANGER en cours
          de route (même expérience que le checkout des paiements VPN/accès
          distant — demande opérateur). Les rails directs restent en
          raccourcis ci-dessous : le forçage par rail fonctionne (confirmé en
          v66), le hosted ajoute simplement la liberté de changer d'avis sur
          la page sécurisée. */}
      <button
        type="button"
        onClick={() => pay("hosted")}
        disabled={Boolean(busy)}
        style={{
          width: "100%",
          padding: "14px 16px",
          border: "2px solid #1C1917",
          background: "#EAB308",
          color: "#1C1917",
          fontSize: "1rem",
          fontWeight: 800,
          cursor: busy ? "default" : "pointer",
          opacity: busy && busy !== "hosted" ? 0.5 : 1,
        }}
      >
        {busy === "hosted" ? "Redirection…" : "Choisir mon moyen de paiement"}
      </button>
      <p
        style={{
          margin: "6px 0 14px",
          fontSize: ".72rem",
          color: "#57534E",
          textAlign: "center",
        }}
      >
        Wave, Orange Money, MTN MoMo, Moov Money, carte — changez de moyen à tout
        moment sur la page sécurisée.
      </p>

      <p
        style={{
          margin: "0 0 10px",
          fontSize: ".8rem",
          color: "#57534E",
          textAlign: "center",
        }}
      >
        Ou commencer avec :
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {METHODS.map((m) => {
          const loading = busy === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => pay(m.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "11px 14px",
                border: "1px solid #D8D2C6",
                background: "#FBFAF8",
                color: "#1C1917",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
                textAlign: "left",
                opacity: busy && !loading ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  background: "#F0EDE6",
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.logo}
                  alt=""
                  style={{ maxWidth: 28, maxHeight: 28, objectFit: "contain", display: "block" }}
                />
              </span>
              <span style={{ flex: 1 }}>{loading ? "Redirection…" : m.label}</span>
              <span style={{ color: "#57534E", fontSize: "1.3rem", lineHeight: 1 }} aria-hidden="true">
                ›
              </span>
            </button>
          );
        })}
      </div>

      {error ? <p style={{ margin: "12px 0 0", color: "#C2410C", fontSize: ".85rem" }}>{error}</p> : null}

      {/* Repli portail captif : ouvrir la page dans le vrai navigateur */}
      <div
        style={{
          margin: "18px 0 0",
          padding: "14px 14px 16px",
          border: "2px dashed #D8D2C6",
          background: "#F0EDE6",
        }}
      >
        <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#57534E", lineHeight: 1.5 }}>
          La page de paiement reste bloquée sur le logo ? Ouvrez cette page dans <b>Chrome</b> ou{" "}
          <b>Safari</b> pour payer, puis revenez saisir votre code.
        </p>
        <button
          type="button"
          onClick={openInBrowser}
          style={{
            width: "100%",
            padding: 12,
            border: "2px solid #1C1917",
            background: "#1C1917",
            color: "#FBFAF8",
            fontSize: ".92rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Ouvrir dans mon navigateur
        </button>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            readOnly
            value={pageUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "9px 10px",
              border: "1px solid #D8D2C6",
              fontSize: ".78rem",
              color: "#57534E",
              background: "#FBFAF8",
            }}
          />
          <button
            type="button"
            onClick={copyLink}
            style={{
              padding: "9px 12px",
              border: "1px solid #D8D2C6",
              background: "#FBFAF8",
              color: "#1C1917",
              fontSize: ".8rem",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      </div>

      <p style={{ margin: "16px 0 0", fontSize: ".72rem", color: "#57534E", textAlign: "center", lineHeight: 1.5 }}>
        Paiement sécurisé via GeniusPay. Après le paiement, un <b>code WiFi</b> s’affiche :
        saisissez-le sur le portail WiFi pour vous connecter.
      </p>

      {/* Repli mobile money : un client dont le paiement s'est terminé sur le
          téléphone (navigateur non revenu) retrouve son code par son numéro. */}
      <p style={{ margin: "10px 0 0", fontSize: ".8rem", textAlign: "center" }}>
        <a
          href={`/portal/recover?slug=${encodeURIComponent(slug)}`}
          style={{ color: "#1C1917", fontWeight: 700, textDecoration: "underline" }}
        >
          Déjà payé ? Retrouver mon code
        </a>
      </p>
    </div>
  );
}
