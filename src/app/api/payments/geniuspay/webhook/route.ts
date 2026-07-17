// Webhook GeniusPay (compte plateforme) — reçoit les événements de paiement
// des accès distants VPN. À l'événement payment.success, approuve la demande
// correspondante pour que l'org puisse ouvrir l'accès. Endpoint public (aucune
// session) : la seule protection est la signature HMAC. Runtime Node par
// défaut (nécessaire pour crypto). Doc : https://pay.genius.ci/doc
//
// À enregistrer côté GeniusPay : POST https://<domaine>/api/payments/geniuspay/webhook
// avec l'événement payment.success (au minimum).

import { revalidatePath } from "next/cache";
import { verifyGeniusWebhookSignature } from "@/lib/payment-gateways/geniuspay";
import { approveRemoteAccessPaymentByReference } from "@/lib/billing/remote-access-authorization-service";
import { approveAutoSetupPaymentByReference } from "@/lib/billing/auto-setup-authorization-service";
import { confirmAndFulfillPortalByReference } from "@/lib/portal/fulfill";

export async function POST(request: Request) {
  // Corps BRUT indispensable au calcul HMAC (un JSON re-sérialisé casserait
  // la signature).
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");
  const timestamp = request.headers.get("x-webhook-timestamp");
  const event = request.headers.get("x-webhook-event");

  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[geniuspay:webhook] corps JSON invalide");
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  // Le type d'événement peut arriver en en-tête ou dans le corps.
  const eventType = event ?? (payload?.event as string) ?? "";
  const data = (payload?.data as Record<string, unknown>) ?? payload ?? {};
  const reference = (data.reference as string) || (payload?.reference as string) || "";
  const status = (data.status as string) || "";

  // 1) PORTAIL CAPTIF (paiements PAR-ORG). Pas de secret de signature partagé :
  // on retrouve la commande par sa référence et on RE-VÉRIFIE le paiement via les
  // clés de l'org (autorité) avant d'honorer — un faux webhook ne débloque rien.
  // Traité AVANT la vérif de signature plateforme. Si la référence n'est pas une
  // commande portail, on enchaîne sur le flux plateforme (signé) plus bas.
  if (reference) {
    try {
      const portal = await confirmAndFulfillPortalByReference(reference);
      if (portal.found) {
        if (portal.fulfilled) revalidatePath("/admin/vouchers");
        console.info("[geniuspay:webhook] commande portail", {
          reference,
          fulfilled: portal.fulfilled,
        });
        return Response.json({ received: true, handled: portal.fulfilled, kind: "portal" });
      }
    } catch (e) {
      console.error("[geniuspay:webhook] échec traitement portail", { reference, error: String(e) });
      // 500 → GeniusPay ré-essaiera (le traitement est idempotent).
      return Response.json({ error: "processing failed" }, { status: 500 });
    }
  }

  // 2) PLATEFORME (accès distant / auto-setup) : exige une signature HMAC valide
  // (GENIUSPAY_WEBHOOK_SECRET).
  if (!verifyGeniusWebhookSignature({ rawBody, signature, timestamp })) {
    console.warn("[geniuspay:webhook] signature invalide", { event, hasSig: Boolean(signature) });
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  const isSuccess =
    eventType === "payment.success" || status === "completed" || status === "success";

  if (!isSuccess) {
    // Événement non pertinent (initiated, failed, test, …) : accusé de réception.
    return Response.json({ received: true, handled: false });
  }
  if (!reference) {
    return Response.json({ received: true, handled: false, reason: "no reference" });
  }

  // La référence appartient soit à un accès distant, soit à un auto-setup. On
  // tente les deux (chacune est idempotente et ne touche que "pending").
  let handled = false;
  try {
    const remote = await approveRemoteAccessPaymentByReference(reference);
    if (remote) {
      handled = true;
      console.info("[geniuspay:webhook] accès distant approuvé", { reference, id: remote.id });
      revalidatePath("/admin/remote-access");
    } else {
      const autoSetup = await approveAutoSetupPaymentByReference(reference);
      if (autoSetup) {
        handled = true;
        console.info("[geniuspay:webhook] auto-setup approuvé", { reference, id: autoSetup.id });
        revalidatePath("/admin/settings/router-setup");
      }
    }
  } catch (e) {
    console.error("[geniuspay:webhook] échec approbation", { reference, error: String(e) });
    // 500 → GeniusPay ré-essaiera la livraison (l'approbation est idempotente).
    return Response.json({ error: "processing failed" }, { status: 500 });
  }

  if (handled) {
    revalidatePath("/admin/authorizations");
  } else {
    // Référence inconnue ou déjà traitée : normal (rejeu/idempotence).
    console.info("[geniuspay:webhook] payment.success sans demande à approuver", { reference });
  }

  // 200 même si déjà traité / référence inconnue : idempotent, pas de re-livraison.
  return Response.json({ received: true, handled });
}
