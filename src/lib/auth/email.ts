// Transactional auth emails (account activation + password reset) sent via
// Resend. Server-only — imported exclusively by server actions. The sender
// must be a Resend-verified domain: mail.safelinkhub.io has sending enabled,
// so the default From uses it. Override with RESEND_FROM.
import { Resend } from "resend";

const DEFAULT_FROM = "SafeLinkHub <noreply@mail.safelinkhub.io>";

// Base publique pour les liens des emails. Volontairement autonome (pas de
// dépendance à lib/net/app-url) : NEXT_PUBLIC_APP_URL est inliné au build et
// peut être vide selon l'environnement, d'où le repli sur le domaine prod.
function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://safelinkhub.io").replace(/\/+$/, "");
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function getFrom(): string {
  return process.env.RESEND_FROM || DEFAULT_FROM;
}

// Shared, brand-light HTML shell. Kept deliberately simple (inline styles,
// table-free) — enough to render cleanly across mail clients without pulling
// in a templating dependency.
function layout(title: string, bodyHtml: string, ctaLabel: string, ctaUrl: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1917">
    <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
    ${bodyHtml}
    <p style="margin:24px 0">
      <a href="${ctaUrl}" style="display:inline-block;background:#E0A82E;color:#1C1917;font-weight:bold;text-decoration:none;padding:12px 24px;border:2px solid #1C1917">${ctaLabel}</a>
    </p>
    <p style="font-size:13px;color:#57534E;margin:16px 0 0">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur&nbsp;:<br>
      <a href="${ctaUrl}" style="color:#1C1917">${ctaUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #E7E5E4;margin:24px 0">
    <p style="font-size:12px;color:#78716C;margin:0">SafeLinkHub — pilotez vos routeurs, ventes et accès distants.</p>
  </div>`;
}

/** Best-effort; returns false if Resend isn't configured or the send fails. */
export async function sendActivationEmail(to: string, name: string, token: string): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  const url = `${appBaseUrl()}/auth/activation?token=${encodeURIComponent(token)}`;
  const html = layout(
    "Activez votre compte SafeLinkHub",
    `<p style="font-size:15px;line-height:1.6">Bonjour ${escapeHtml(name)},</p>
     <p style="font-size:15px;line-height:1.6">Bienvenue&nbsp;! Confirmez votre adresse email pour activer votre compte et accéder à votre tableau de bord. Ce lien expire dans 24&nbsp;heures.</p>`,
    "Activer mon compte",
    url,
  );
  const { error } = await resend.emails.send({
    from: getFrom(),
    to,
    subject: "Activez votre compte SafeLinkHub",
    html,
  });
  return !error;
}

/** Best-effort; returns false if Resend isn't configured or the send fails. */
export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  const url = `${appBaseUrl()}/auth/reinitialiser?token=${encodeURIComponent(token)}`;
  const html = layout(
    "Réinitialisez votre mot de passe",
    `<p style="font-size:15px;line-height:1.6">Bonjour ${escapeHtml(name)},</p>
     <p style="font-size:15px;line-height:1.6">Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau. Ce lien expire dans 1&nbsp;heure.</p>
     <p style="font-size:15px;line-height:1.6">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email&nbsp;: votre mot de passe reste inchangé.</p>`,
    "Choisir un nouveau mot de passe",
    url,
  );
  const { error } = await resend.emails.send({
    from: getFrom(),
    to,
    subject: "Réinitialisation de votre mot de passe SafeLinkHub",
    html,
  });
  return !error;
}

/**
 * Alerte « routeur hors ligne » envoyée à un administrateur de l'org dès qu'un
 * MikroTik perd sa liaison à SafeLinkHub (tunnel WireGuard/OpenVPN tombé).
 * Best-effort : renvoie false si Resend n'est pas configuré ou l'envoi échoue.
 */
export async function sendRouterOfflineEmail(
  to: string,
  name: string,
  routerName: string,
): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  const url = `${appBaseUrl()}/admin/router`;
  const safeRouter = escapeHtml(routerName);
  const html = layout(
    `⚠️ ${safeRouter} est hors ligne`,
    `<p style="font-size:15px;line-height:1.6">Bonjour ${escapeHtml(name)},</p>
     <p style="font-size:15px;line-height:1.6">Votre routeur <strong>${safeRouter}</strong> vient de perdre sa connexion à SafeLinkHub&nbsp;: son tunnel de gestion (VPN) ne répond plus. Le WiFi peut sembler fonctionner sur place, mais le routeur n'est plus pilotable à distance (ventes du portail, accès distant, synchronisation).</p>
     <p style="font-size:15px;line-height:1.6"><strong>À vérifier sur place&nbsp;:</strong> l'accès Internet réel du routeur (ouvrez un site depuis un téléphone connecté au WiFi), la box/FAI et le forfait data, l'alimentation. Un redémarrage du routeur et de la box résout la plupart des cas. Le routeur repassera « en ligne » automatiquement dès qu'il retrouve Internet.</p>`,
    "Voir mes routeurs",
    url,
  );
  const { error } = await resend.emails.send({
    from: getFrom(),
    to,
    subject: `⚠️ SafeLinkHub — ${routerName} est hors ligne`,
    html,
  });
  return !error;
}

export async function sendConversionAlertEmail(
  to: string,
  name: string,
  params: { orgName: string; rate: number; threshold: number; paid: number; total: number },
): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  const url = `${appBaseUrl()}/admin/conversion`;
  const html = layout(
    `📉 Conversion paiement en baisse (${params.rate}%)`,
    `<p style="font-size:15px;line-height:1.6">Bonjour ${escapeHtml(name)},</p>
     <p style="font-size:15px;line-height:1.6">Hier, le taux de <strong>conversion des paiements</strong> du portail captif${params.orgName ? ` de <strong>${escapeHtml(params.orgName)}</strong>` : ""} est tombé à <strong>${params.rate}%</strong> (seuil d'alerte&nbsp;: ${params.threshold}%)&nbsp;: seulement <strong>${params.paid}</strong> paiement(s) abouti(s) sur <strong>${params.total}</strong> commande(s).</p>
     <p style="font-size:15px;line-height:1.6"><strong>À vérifier&nbsp;:</strong> les clients atteignent-ils le paiement puis abandonnent (souvent le mini-navigateur du portail captif — pensez à ouvrir dans le vrai navigateur)&nbsp;? Le moyen de paiement (Wave/Orange/MTN) fonctionne-t-il&nbsp;? Le détail par jour est dans « Conversion paiement ».</p>`,
    "Voir la conversion",
    url,
  );
  const { error } = await resend.emails.send({
    from: getFrom(),
    to,
    subject: `📉 SafeLinkHub — conversion paiement à ${params.rate}% hier`,
    html,
  });
  return !error;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
