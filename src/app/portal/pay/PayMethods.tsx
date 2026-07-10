"use client";

// Choix du moyen de paiement (page hébergée /portal/pay). Un clic crée la
// transaction GeniusPay du rail choisi (POST /api/portal/[slug]/pay) puis
// redirige la MÊME fenêtre vers le checkout du rail.
//
// IMPORTANT : sur les comptes GeniusPay "startup" de CI, TOUS les rails
// mobile-money (orange_money, mtn_money) sont routés vers Wave (pay.wave.com) —
// afficher des boutons Orange/MTN distincts induit donc le client en erreur
// (ils atterrissent tous sur Wave). On n'affiche que les moyens réellement
// distincts. Pour proposer un vrai flux Orange/MTN/carte, l'opérateur doit les
// activer sur son compte pay.genius.ci (Moyens de paiement), puis on pourra
// rallonger cette liste.

import { useState } from "react";

type Method = { id: string; label: string; sub: string; bg: string; fg: string };

const METHODS: Method[] = [
  { id: "wave", label: "Payer avec Wave", sub: "Mobile Money — recommandé", bg: "#1dc4ff", fg: "#00263a" },
];

export default function PayMethods({ slug, orderId }: { slug: string; orderId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function pay(method: string) {
    if (busy) return;
    setBusy(method);
    setError("");
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
      // Même fenêtre : le portail captif iOS/Android ne peut pas ouvrir d'onglet.
      window.location.assign(data.checkoutUrl);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : "Erreur réseau. Réessayez.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                width: "100%",
                padding: "16px",
                border: 0,
                borderRadius: 12,
                background: m.bg,
                color: m.fg,
                fontSize: "1.05rem",
                fontWeight: 700,
                cursor: busy ? "default" : "pointer",
                opacity: busy && !loading ? 0.5 : 1,
              }}
            >
              <span>{loading ? "Redirection vers Wave…" : m.label}</span>
              {!loading ? (
                <span style={{ fontSize: ".72rem", fontWeight: 500, opacity: 0.85 }}>{m.sub}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {error ? (
        <p style={{ margin: "12px 0 0", color: "#ef4444", fontSize: ".85rem" }}>{error}</p>
      ) : null}
      <p style={{ margin: "16px 0 0", fontSize: ".72rem", color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
        Paiement sécurisé via GeniusPay. Après le paiement, <b>votre appareil se connecte tout seul</b>
        {" "}à ce WiFi — aucun code à saisir. Un SMS de confirmation vous est envoyé.
      </p>
    </div>
  );
}
