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

type Method = { id: string; label: string; logo: string };

// Reproduit la LISTE du checkout GeniusPay (un moyen par ligne, logo + nom) :
// chaque clic initie le paiement sur CE rail précis (payment_method envoyé à
// l'API GeniusPay). Valeurs acceptées : wave | orange_money | mtn_money |
// moov_money | card (validées à l'intégration, cf. geniuspay-org.ts). Un lien
// « tous les moyens » ouvre en repli le checkout hébergé (payment_method omis)
// si un rail précis n'est pas activé côté marchand.
const METHODS: Method[] = [
  { id: "wave", label: "Wave", logo: "/payment/wave.png" },
  { id: "orange_money", label: "Orange Money", logo: "/payment/orange.png" },
  { id: "mtn_money", label: "MTN MoMo", logo: "/payment/mtn-momo.png" },
  { id: "moov_money", label: "Moov Money", logo: "/payment/moov.png" },
  { id: "card", label: "Carte bancaire", logo: "/payment/visa.svg" },
];

export default function PayMethods({ slug, orderId }: { slug: string; orderId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // client-only : window absent au rendu serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(window.location.href);
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
        body: JSON.stringify({ orderId, method }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Paiement impossible. Réessayez.");
      }
      if (win && !win.closed) {
        win.location.href = data.checkoutUrl; // Safari (nouvel onglet) → checkout OK
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
      <p
        style={{
          margin: "0 0 10px",
          fontSize: ".8rem",
          color: "#64748b",
          textAlign: "center",
        }}
      >
        Choisissez votre moyen de paiement
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
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                background: "#fff",
                color: "#0f172a",
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
                  borderRadius: 10,
                  background: "#f1f5f9",
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
              <span style={{ color: "#94a3b8", fontSize: "1.3rem", lineHeight: 1 }} aria-hidden="true">
                ›
              </span>
            </button>
          );
        })}
      </div>

      {/* Repli : le checkout hébergé GeniusPay (payment_method omis) liste tous
          les moyens — utile si un rail précis n'est pas activé côté marchand. */}
      <button
        type="button"
        onClick={() => pay("hosted")}
        disabled={Boolean(busy)}
        style={{
          marginTop: 10,
          width: "100%",
          background: "none",
          border: 0,
          color: "#64748b",
          fontSize: ".8rem",
          textDecoration: "underline",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy === "hosted" ? "Redirection…" : "Un autre moyen ? Tous les moyens de paiement"}
      </button>

      {error ? <p style={{ margin: "12px 0 0", color: "#ef4444", fontSize: ".85rem" }}>{error}</p> : null}

      {/* Repli portail captif : ouvrir la page dans le vrai navigateur */}
      <div
        style={{
          margin: "18px 0 0",
          padding: "14px 14px 16px",
          border: "1px dashed #cbd5e1",
          borderRadius: 12,
          background: "#f8fafc",
        }}
      >
        <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#475569", lineHeight: 1.5 }}>
          La page de paiement reste bloquée sur le logo ? Ouvrez cette page dans <b>Chrome</b> ou{" "}
          <b>Safari</b> pour payer, puis revenez saisir votre code.
        </p>
        <button
          type="button"
          onClick={openInBrowser}
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid #0f172a",
            borderRadius: 10,
            background: "#0f172a",
            color: "#fff",
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
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              fontSize: ".78rem",
              color: "#475569",
              background: "#fff",
            }}
          />
          <button
            type="button"
            onClick={copyLink}
            style={{
              padding: "9px 12px",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: "#fff",
              color: "#0f172a",
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

      <p style={{ margin: "16px 0 0", fontSize: ".72rem", color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
        Paiement sécurisé via GeniusPay. Après le paiement, un <b>code WiFi</b> s’affiche (+ SMS) :
        saisissez-le sur le portail WiFi pour vous connecter.
      </p>
    </div>
  );
}
