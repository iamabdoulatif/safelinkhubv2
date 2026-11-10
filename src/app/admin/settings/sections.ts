// Module SANS "use client" : la page Général (composant serveur) itère sur
// cette liste. Exportée depuis SettingsTabs.tsx (client), elle arrivait côté
// serveur comme une référence client — `.filter is not a function` en prod.
import {
  CreditCard,
  LayoutTemplate,
  MessageSquare,
  Router,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";

// Sections du hub Paramètres — chaque entrée pointe vers une page réelle.
// « Abonnement » vit hors de /settings (facturation) mais appartient
// fonctionnellement au même hub. Vocabulaire unique : ces libellés restent
// identiques à ceux de la page Général (la sidebar n'expose qu'une entrée
// « Paramètres » — un seul système de navigation).
export const SETTINGS_SECTIONS = [
  { href: "/admin/settings/general", label: "Général", icon: SlidersHorizontal },
  { href: "/admin/settings/router-setup", label: "Configuration routeur", icon: Router },
  { href: "/admin/settings/payment-gateways", label: "Passerelles de paiement", icon: CreditCard },
  { href: "/admin/settings/captive-templates", label: "Portail captif", icon: LayoutTemplate },
  { href: "/admin/settings/walled-garden", label: "Walled-garden", icon: ShieldCheck },
  { href: "/admin/settings/sms", label: "SMS", icon: MessageSquare },
  { href: "/admin/billing", label: "Abonnement", icon: Wallet },
  { href: "/admin/settings/advanced", label: "Avancé", icon: Settings2 },
] as const;
