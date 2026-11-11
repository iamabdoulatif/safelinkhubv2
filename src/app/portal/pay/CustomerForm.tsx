"use client";

// Formulaire affiché à la PREMIÈRE commande d'un numéro (page hébergée
// /portal/pay) : prénom, nom, email. Le numéro est celui de la commande (lecture
// seule). À la validation → POST /api/portal/[slug]/customer (upsert par
// (org, numéro)) puis onDone() révèle les moyens de paiement. Les fois
// suivantes, le serveur saute ce formulaire (fiche déjà en base).

import { useState } from "react";
import styles from "../PortalExperience.module.css";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function CustomerForm({
  slug,
  orderId,
  phone,
  onDone,
}: {
  slug: string;
  orderId: string;
  phone: string;
  onDone: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim();
    if (!fn || !ln) {
      setError("Prénom et nom requis.");
      return;
    }
    if (!EMAIL_RE.test(em)) {
      setError("Email invalide.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, firstName: fn, lastName: ln, email: em }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "");
      onDone();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error && e.message ? e.message : "Enregistrement impossible. Réessayez.");
    }
  }

  return (
    <div className={styles.form}>
      <p className={styles.copy}>
        Première commande avec ce numéro : renseignez vos informations pour recevoir vos accès et
        votre reçu. Elles seront mémorisées pour vos prochains achats.
      </p>
      <label className={styles.fieldLabel}>
        Prénom
        <input
          className={styles.input}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
          placeholder="Votre prénom"
        />
      </label>
      <label className={styles.fieldLabel}>
        Nom
        <input
          className={styles.input}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
          placeholder="Votre nom"
        />
      </label>
      <label className={styles.fieldLabel}>
        Email
        <input
          className={styles.input}
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoComplete="email"
          placeholder="vous@exemple.com"
        />
      </label>
      <label className={styles.fieldLabel}>
        Numéro
        <input className={styles.input} value={`+${phone}`} readOnly disabled />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.primaryButton} onClick={submit} disabled={busy}>
        {busy ? "Enregistrement…" : "Continuer vers le paiement"}
      </button>
    </div>
  );
}
