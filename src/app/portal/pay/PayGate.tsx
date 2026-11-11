"use client";

// Porte d'entrée de la page de paiement : si le numéro n'a pas encore de fiche
// client (1re commande), on montre le formulaire prénom/nom/email AVANT les
// moyens de paiement ; sinon on va droit aux moyens. Une fois la fiche
// enregistrée, on bascule sur les moyens sans rechargement (fragile en fenêtre
// captive).

import { useState } from "react";
import type { PortalTheme } from "@/lib/portal/theme";
import CustomerForm from "./CustomerForm";
import PayMethods from "./PayMethods";

export default function PayGate({
  needsCustomer,
  phone,
  slug,
  orderId,
  theme,
}: {
  needsCustomer: boolean;
  phone: string;
  slug: string;
  orderId: string;
  theme: PortalTheme;
}) {
  const [collected, setCollected] = useState(!needsCustomer);
  if (!collected) {
    return <CustomerForm slug={slug} orderId={orderId} phone={phone} onDone={() => setCollected(true)} />;
  }
  return <PayMethods slug={slug} orderId={orderId} theme={theme} />;
}
