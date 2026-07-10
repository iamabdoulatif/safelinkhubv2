"use client";

// Choix du moyen de paiement (page hébergée /portal/pay). Un clic crée la
// transaction GeniusPay du rail choisi (POST /api/portal/[slug]/pay) puis
// redirige la MÊME fenêtre vers le checkout du rail.
//
// IMPORTANT : sur les comptes GeniusPay "startup" de CI, TOUS les rails
// mobile-money (orange_money, mtn_money) sont routés vers Wave (pay.wave.com) —
// afficher des boutons Orange/MTN distincts induit donc le client en erreur.
// On n'affiche que Wave. Pour un vrai flux Orange/MTN/carte, l'opérateur doit
// les activer sur son compte pay.genius.ci, puis on rallongera cette liste.
//
// Le mini-navigateur des portails captifs (CNA iOS / Android) gère mal les SPA
// lourdes comme le checkout Wave (« ça pompe sur le logo »). On propose donc un
// repli « ouvrir dans le navigateur » : la page /portal/pay est sur
// safelinkhub.io (walled-garden autorisé) donc elle s'ouvre AUSSI dans Chrome/
// Safari, où Wave fonctionne pleinement. Après paiement, l'appareil se connecte
// seul par MAC — inutile de revenir dans le portail.

import { useEffect, useState } from "react";

export default function PayMethods({ slug, orderId }: { slug: string; orderId: string }) {
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
        body: JSON.stringify({ orderId, method: "wave" }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Paiement impossible. Réessayez.");
      }
      // Même fenêtre : le portail captif ne peut pas ouvrir d'onglet.
      window.location.assign(data.checkoutUrl);
    } catch (e) {
      setBusy(false);
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
      <button
        type="button"
        disabled={busy}
        onClick={pay}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          width: "100%",
          padding: 16,
          border: 0,
          borderRadius: 12,
          background: "#1dc4ff",
          color: "#00263a",
          fontSize: "1.05rem",
          fontWeight: 700,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span>{busy ? "Redirection vers Wave…" : "Payer avec Wave"}</span>
        {!busy ? <span style={{ fontSize: ".72rem", fontWeight: 500, opacity: 0.85 }}>Mobile Money</span> : null}
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
          La page Wave reste bloquée sur le logo ? Ouvrez cette page dans <b>Chrome</b> ou{" "}
          <b>Safari</b> pour payer, puis revenez : votre appareil se connectera tout seul.
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
            {copied ? "Copié ✓" : "Copier"}
          </button>
        </div>
      </div>

      <p style={{ margin: "16px 0 0", fontSize: ".72rem", color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
        Paiement sécurisé via GeniusPay. Après le paiement, <b>votre appareil se connecte tout seul</b> à
        ce WiFi — aucun code à saisir. Un SMS de confirmation vous est envoyé.
      </p>
    </div>
  );
}
