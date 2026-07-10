"use client";

// Choix du moyen de paiement (page hébergée /portal/pay). Un clic crée la
// transaction GeniusPay du rail choisi (POST /api/portal/[slug]/pay) puis
// redirige la MÊME fenêtre vers le checkout du rail. Wave est recommandé : il
// redirige vers pay.wave.com (walled-garden autorisé), le plus fiable derrière
// un portail captif iOS. Orange/MTN restent proposés ; la carte est marquée
// comme peu fiable sur portail captif (3-D Secure hors walled-garden).

import { useState } from "react";

type Method = { id: string; label: string; hint?: string; bg: string; fg: string };

// Rails mobile-money uniquement : ils redirigent vers des pages web
// (pay.wave.com…) joignables derrière le portail captif. La carte (paystack /
// 3-D Secure) est exclue ici — son checkout et l'ACS bancaire sortent du
// walled-garden et échouent sur WiFi captif.
const METHODS: Method[] = [
  { id: "wave", label: "Wave", hint: "Recommandé", bg: "#1dc4ff", fg: "#00263a" },
  { id: "orange_money", label: "Orange Money", bg: "#ff7900", fg: "#fff" },
  { id: "mtn_money", label: "MTN Money", bg: "#ffcc00", fg: "#1a1a1a" },
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
      <p style={{ margin: "0 0 10px", fontSize: ".8rem", color: "#64748b" }}>
        Choisissez votre moyen de paiement :
      </p>
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
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                width: "100%",
                padding: "14px 16px",
                border: 0,
                borderRadius: 12,
                background: m.bg,
                color: m.fg,
                fontSize: "1rem",
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
                opacity: busy && !loading ? 0.5 : 1,
              }}
            >
              <span>{loading ? "Redirection…" : m.label}</span>
              {m.hint && !loading ? (
                <span style={{ fontSize: ".68rem", fontWeight: 500, opacity: 0.85 }}>{m.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {error ? (
        <p style={{ margin: "12px 0 0", color: "#ef4444", fontSize: ".85rem" }}>{error}</p>
      ) : null}
      <p style={{ margin: "16px 0 0", fontSize: ".72rem", color: "#94a3b8", textAlign: "center" }}>
        Paiement sécurisé via GeniusPay. Après paiement, votre accès WiFi s’active automatiquement.
      </p>
    </div>
  );
}
