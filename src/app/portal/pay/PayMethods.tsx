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
import { isCaptiveBrowser, waveQrHref } from "@/lib/portal/browser-href";
import styles from "../PortalExperience.module.css";

type Method = { id: string; label: string; logo: string };

// Liste des moyens affichés (logo + nom). Côté serveur
// (/api/portal/[slug]/pay) : "wave" → direct pay.wave.com ; Orange/MTN/Moov →
// rail PawaPay de GeniusPay (opérateur du pays du client) ; indisponible →
// checkout HÉBERGÉ GeniusPay (le client retrouve son opérateur). MTN/Moov en API
// directe CinetPay si l'org a des clés.
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

  // Wave préparé d'avance (fenêtre captive) : la tuile devient un VRAI lien
  // qr.pay.wave.com — voir /api/portal/[slug]/wave-prepare.
  const [wavePrep, setWavePrep] = useState<{ orderId: string; checkoutUrl: string; lane: boolean } | null>(null);
  const [waveLaunched, setWaveLaunched] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // En fenêtre captive, la tuile Wave ATTEND la préparation (quelques
  // secondes) plutôt que de lancer l'ancien parcours en cas de tap précoce.
  // Elle ne repasse en bouton classique qu'en cas d'échec.
  const [wavePreparing, setWavePreparing] = useState(false);

  useEffect(() => {
    // client-only : window absent au rendu serveur.
    const url = window.location.href;
    const ua = navigator.userAgent || "";
    const inCaptive = isCaptiveBrowser(ua);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageUrl(url);
    setCaptive(inCaptive);
    if (!inCaptive) return;
    // Retour du rechargement ci-dessous : paiement Wave déjà préparé et voie
    // ouverte — la tuile est un lien tout de suite, sans nouvelle préparation.
    const sp = new URLSearchParams(window.location.search);
    const readyOrder = sp.get("wave");
    const readyCheckout = sp.get("wcu");
    if (readyOrder && readyCheckout && waveQrHref(readyCheckout)) {
      setWavePrep({ orderId: readyOrder, checkoutUrl: readyCheckout, lane: true });
      return;
    }
    let alive = true;
    let reloading = false;
    setWavePreparing(true);
    fetch(`/api/portal/${encodeURIComponent(slug)}/wave-prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, theme, captive: true }),
    })
      .then((r) => r.json())
      .then((d: { orderId?: string; checkoutUrl?: string; lane?: boolean }) => {
        if (alive && d.orderId && d.checkoutUrl && waveQrHref(d.checkoutUrl)) {
          if (d.lane === true) {
            // La fenêtre Wi-Fi iOS ne revérifie la connexion (✕ → ✓) qu'au
            // CHARGEMENT d'une page. Tant que ✓ n'est pas affiché, un tap sur
            // le lien Wave est chargé sur place (bloqué) au lieu de partir vers
            // Chrome puis l'app — l'« instabilité » de la vidéo 22:13. On
            // recharge donc la page une fois la voie ouverte : ✓ apparaît, et
            // la tuile n'est cliquable qu'après.
            const next = new URL(window.location.href);
            next.searchParams.set("wave", d.orderId);
            next.searchParams.set("wcu", d.checkoutUrl);
            const target = next.toString();
            reloading = true;
            window.setTimeout(() => window.location.replace(target), 300);
            return;
          }
          setWavePrep({ orderId: d.orderId, checkoutUrl: d.checkoutUrl, lane: false });
        }
      })
      .catch(() => {
        /* repli : la tuile Wave garde le parcours classique */
      })
      .finally(() => {
        // Rechargement en cours (voie ouverte) : la tuile reste « Préparation… ».
        if (alive && !reloading) setWavePreparing(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, orderId, theme]);

  function paidUrlFor(id: string): URL {
    const u = new URL("/portal/paid", window.location.origin);
    u.searchParams.set("orderId", id);
    u.searchParams.set("slug", slug);
    u.searchParams.set("accent", theme.accent);
    u.searchParams.set("surface", theme.surface);
    u.searchParams.set("text", theme.text);
    return u;
  }

  // Au retour dans la fenêtre Wi-Fi (après Wave), on passe au suivi du
  // paiement : le code s'y affiche dès la confirmation.
  useEffect(() => {
    if (!waveLaunched || !wavePrep) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const u = paidUrlFor(wavePrep.orderId);
      u.searchParams.set("lane", "1");
      u.searchParams.set("pay", wavePrep.checkoutUrl);
      window.location.assign(u);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveLaunched, wavePrep]);

  // Tap sur la tuile Wave préparée : le lien part vers le navigateur puis
  // l'app Wave ; en parallèle on demande au routeur d'ouvrir la voie de
  // paiement (réseau pour l'app Wave). sendBeacon survit au départ de la page.
  function onWaveLinkTap() {
    if (!wavePrep) return;
    // Voie déjà ouverte au chargement : la rouvrir maintenant couperait la
    // session au moment précis où Chrome charge Wave.
    if (wavePrep.lane) {
      setWaveLaunched(true);
      return;
    }
    const payload = JSON.stringify({ orderId: wavePrep.orderId, checkoutUrl: wavePrep.checkoutUrl });
    const url = `/api/portal/${encodeURIComponent(slug)}/lane`;
    const sent = navigator.sendBeacon?.(url, new Blob([payload], { type: "application/json" }));
    if (!sent) {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
    }
    setWaveLaunched(true);
  }

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
      // Réponse non-JSON (page d'erreur d'un proxy) : message lisible au lieu
      // de l'erreur brute de Safari « The string did not match… ».
      const data = (await res.json().catch(() => ({
        error: "Le service de paiement ne répond pas. Réessayez dans un instant.",
      }))) as {
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
        // Wave : le lien qr.pay.wave.com (lien universel) ouvre l'app directement.
        win.location.href = waveQrHref(data.checkoutUrl) ?? data.checkoutUrl;
        // GeniusPay v3 ne redirige PAS vers success_url après paiement (le client
        // reste bloqué sur geniuspay.ci). On envoie donc l'onglet D'ORIGINE (sur
        // notre domaine, derrière le walled-garden) sonder le statut : c'est CE
        // sondage qui déclenche la fulfillment, lance l'auto-login et AFFICHE le
        // code — indépendamment du retour de geniuspay.ci.
        window.location.assign(paidUrl);
      } else {
        window.location.assign(waveQrHref(data.checkoutUrl) ?? data.checkoutUrl); // fenêtre bloquée → même fenêtre
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

  // Champ de sélection (demande opérateur, 13/10/2026) : « Choisir un moyen de
  // paiement ▾ » déplie les opérateurs, UN tap sur une ligne lance le
  // paiement — pas de bouton « Payer » en plus. Volontairement PAS un
  // <select> natif : dans la fenêtre Wi-Fi iOS, seul un vrai lien TOUCHÉ
  // (ligne Wave = lien qr.pay.wave.com) part vers Chrome puis l'app Wave ;
  // un changement de <select> suivi d'une navigation reste dans la fenêtre.
  const chosen = METHODS.find((m) => m.id === busy) ?? (waveLaunched ? METHODS[0] : null);
  const triggerLabel = waveLaunched
    ? "Wave ouvert…"
    : chosen
      ? `${chosen.label} — ouverture…`
      : "Choisir un moyen de paiement";

  const optionContent = (m: Method, label: string, badge?: boolean) => (
    <>
      <span className={styles.selectLogo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.logo} alt="" />
      </span>
      <span className={styles.selectLabel}>{label}</span>
      {badge ? <span className={styles.selectBadge}>Le plus rapide</span> : null}
    </>
  );

  return (
    <div>
      <p className={styles.payHeading} id="slh-pay-label">
        Moyen de paiement
      </p>
      <button
        type="button"
        className={styles.selectTrigger}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-labelledby="slh-pay-label"
        disabled={Boolean(busy)}
        onClick={() => setMenuOpen((o) => !o)}
      >
        {chosen ? (
          <span className={styles.selectLogo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={chosen.logo} alt="" />
          </span>
        ) : null}
        <span className={styles.selectLabel}>{triggerLabel}</span>
        {busy ? (
          <span aria-hidden="true" className={styles.paySpinner} />
        ) : (
          <span aria-hidden="true" className={styles.selectChevron}>
            {menuOpen ? "▴" : "▾"}
          </span>
        )}
      </button>

      {menuOpen && !busy ? (
        <ul className={styles.selectMenu} role="listbox" aria-labelledby="slh-pay-label">
          {METHODS.map((m) => {
            const waveLink = m.id === "wave" && wavePrep ? waveQrHref(wavePrep.checkoutUrl) : null;
            if (m.id === "wave" && !waveLink && wavePreparing) {
              return (
                <li key={m.id} role="option" aria-selected={false} aria-disabled className={`${styles.selectOption} ${styles.selectOptionWait}`}>
                  {optionContent(m, "Wave — préparation…", true)}
                  <span aria-hidden="true" className={styles.paySpinner} style={{ marginLeft: "auto" }} />
                </li>
              );
            }
            if (waveLink && wavePrep) {
              // Fenêtre Wi-Fi iOS : un tap sur un lien qr.pay.wave.com direct
              // ÉCHOUE souvent (le CNA charge pay.wave.com en place et l'app ne
              // s'ouvre pas — vidéo 25/10/2026). On route donc vers NOTRE page
              // /portal/paid (voie déjà ouverte) qui propose « Ouvrir dans
              // l'app Wave », le QR à scanner avec un autre téléphone et la
              // sortie Safari — sans jamais échouer sur la page de Wave.
              const escape = paidUrlFor(wavePrep.orderId);
              escape.searchParams.set("lane", "1");
              escape.searchParams.set("pay", wavePrep.checkoutUrl);
              return (
                <li key={m.id} role="option" aria-selected={false}>
                  <a href={escape.toString()} className={styles.selectOption} onClick={() => { onWaveLinkTap(); setMenuOpen(false); }}>
                    {optionContent(m, m.label, true)}
                  </a>
                </li>
              );
            }
            return (
              <li key={m.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className={styles.selectOption}
                  onClick={() => {
                    setMenuOpen(false);
                    void pay(m.id);
                  }}
                >
                  {optionContent(m, m.label, m.id === "wave")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {busy && !waveLaunched ? (
        <div className={styles.payLoading} role="status" aria-live="polite">
          <span aria-hidden="true" className={styles.paySpinner} />
          <span>Ouverture du paiement sécurisé… un instant.</span>
        </div>
      ) : null}

      {/* MTN/Moov via PawaPay : une demande de validation arrive sur le
          téléphone (ou code opérateur à composer) — ça passe par le réseau
          MOBILE, pas par ce Wi-Fi. Le code part par SMS dès l'approbation
          (confirmation côté serveur, sans ce navigateur). */}
      {(busy === "mtn_money" || busy === "moov_money") && !waveLaunched ? (
        <p className={styles.hint} style={{ margin: "12px 0 0", lineHeight: 1.5 }}>
          Une demande de validation <b>{busy === "mtn_money" ? "MTN MoMo" : "Moov Money"}</b> arrive sur
          votre téléphone (ou composez le code opérateur). Votre <b>code Wi-Fi</b> arrive par{" "}
          <b>SMS</b> dès l’approbation.
        </p>
      ) : null}

      {waveLaunched ? (
        <p className={styles.hint} style={{ margin: "12px 0 0" }}>
          Validez le paiement dans <b>Wave</b>, puis revenez ici : votre <b>code Wi-Fi</b> s’affiche
          tout seul.
        </p>
      ) : null}

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
