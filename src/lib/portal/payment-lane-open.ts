// Ouverture de la « voie de paiement » (payment-lane.ts) pour une commande du
// portail : session hotspot restreinte qui donne du réseau à l'app Wave depuis
// la fenêtre Wi-Fi captive, + lien du checkout par SMS si la passerelle de
// l'org est active. Best-effort : renvoie false sans lever.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { connectToRouter } from "@/lib/mikrotik/router-sync";
import { closePaymentLane, openPaymentLane } from "@/lib/mikrotik/payment-lane";
import { normalizeMac } from "@/lib/portal/fulfill";
import { portalOrders } from "@/lib/db/schema";
import { isOrgSmsEnabled, sendOrgSms } from "@/lib/sms/send";

export async function openPaymentLaneForOrder(
  order: {
  id: string;
  orgId: string;
  mac: string | null;
  routerId: string | null;
  phone: string;
  packageName: string | null;
  checkoutUrl: string;
  },
  // false : pas de SMS (ouverture anticipée au chargement de la page de
  // paiement — un SMS par affichage serait du spam).
  opts: { sms?: boolean } = {},
): Promise<{ lane: boolean; smsSent: boolean }> {
  let lane = false;
  let smsSent = false;
  if (!order.mac || !order.routerId) return { lane, smsSent };
  const [router] = await getDb()
    .select()
    .from(routers)
    .where(and(eq(routers.id, order.routerId), eq(routers.orgId, order.orgId)))
    .limit(1);
  if (router) {
    try {
      const client = await connectToRouter(router);
      try {
        lane = await openPaymentLane(client, normalizeMac(order.mac));
      } finally {
        client.close();
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "warn",
          msg: "payment lane open failed",
          orderId: order.id,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
  if (lane && opts.sms !== false && (await isOrgSmsEnabled(order.orgId))) {
    const sms = await sendOrgSms({
      orgId: order.orgId,
      to: order.phone,
      content: `WiFi ${order.packageName ?? ""} : touchez ce lien pour payer ${order.checkoutUrl}`.replace(/\s+/g, " "),
    });
    smsSent = sms.ok;
  }
  return { lane, smsSent };
}

/**
 * Ferme la voie de paiement d'une commande : déconnecte l'appareil et retire le
 * user `pay-<mac>`. À appeler dès que le paiement ÉCHOUE ou est ANNULÉ — sinon
 * la session restreinte (et la connectivité « en ligne » qu'elle montre au
 * téléphone) traîne jusqu'à l'expiration des 10 min, laissant le client
 * « connecté » sans avoir payé. Best-effort : silencieuse, ne lève jamais.
 */
export async function closePaymentLaneForOrder(orderId: string): Promise<void> {
  const [order] = await getDb()
    .select({ mac: portalOrders.mac, routerId: portalOrders.routerId, orgId: portalOrders.orgId })
    .from(portalOrders)
    .where(eq(portalOrders.id, orderId))
    .limit(1);
  if (!order?.mac || !order.routerId) return;
  const [router] = await getDb()
    .select()
    .from(routers)
    .where(and(eq(routers.id, order.routerId), eq(routers.orgId, order.orgId)))
    .limit(1);
  if (!router) return;
  try {
    const client = await connectToRouter(router);
    try {
      await closePaymentLane(client, normalizeMac(order.mac));
    } finally {
      client.close();
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "warn",
        msg: "payment lane close failed",
        orderId,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}
