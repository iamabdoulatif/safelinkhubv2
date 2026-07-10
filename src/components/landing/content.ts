// Contenu éditorial de la landing page — texte réel, pas de placeholder.

export type GeoIconName =
  | "billing"
  | "monitor"
  | "plug"
  | "cloud"
  | "users"
  | "growth"
  | "radius"
  | "agent"
  | "voucher"
  | "router"
  | "wifi"
  | "globe";

export const vendors = [
  "MikroTik",
  "Ruijie Reyee",
  "TP-Link",
  "Ubiquiti UniFi",
  "Cambium Networks",
  "Cisco",
  "D-Link",
  "Huawei",
] as const;

export const painPoints = [
  {
    fix: "Provisionnement automatique",
    pain: "Fini la création manuelle des utilisateurs PPPoE et des vouchers.",
  },
  {
    fix: "Facturation centralisée",
    pain: "Fini le suivi des paiements sur tableurs et outils éparpillés.",
  },
  {
    fix: "Tableau de bord unifié",
    pain: "Fini les pertes de revenus faute de visibilité en temps réel.",
  },
] as const;

export const quickFeatures: {
  title: string;
  description: string;
  icon: GeoIconName;
  span: string; // colonnes lg de la grille asymétrique
  featured?: boolean;
}[] = [
  {
    title: "Facturation hotspot intelligente",
    description:
      "Vendez des forfaits à la durée ou aux données, acceptez le mobile money, et voyez vos revenus arriver sur votre tableau de bord en temps réel.",
    icon: "billing",
    span: "lg:col-span-7",
    featured: true,
  },
  {
    title: "Surveillance réseau en temps réel",
    description:
      "Suivez le temps de fonctionnement, les utilisateurs actifs, la charge CPU et mémoire de chaque routeur, instantanément.",
    icon: "monitor",
    span: "lg:col-span-5",
  },
  {
    title: "Intégration en un clic",
    description:
      "Connectez n'importe quel routeur MikroTik RouterOS avec un seul script d'installation.",
    icon: "plug",
    span: "lg:col-span-4",
  },
  {
    title: "Gestion depuis le cloud",
    description:
      "Gérez tous vos sites et routeurs depuis un seul tableau de bord central.",
    icon: "cloud",
    span: "lg:col-span-4",
  },
  {
    title: "Utilisateurs automatisés",
    description:
      "Provisionnez, expirez et facturez automatiquement les utilisateurs hotspot et PPPoE.",
    icon: "users",
    span: "lg:col-span-4",
  },
  {
    title: "Solutions FAI évolutives",
    description:
      "Passez d'un simple hotspot à un FAI multi-sites sans changer d'outils.",
    icon: "growth",
    span: "lg:col-span-12",
  },
];

export const processSteps: {
  title: string;
  description: string;
}[] = [
  {
    title: "Connexion instantanée",
    description:
      "Connectez n'importe quel routeur MikroTik en un seul script. Aucune configuration manuelle, aucun technicien sur site.",
  },
  {
    title: "Provisionnement automatique",
    description:
      "Vos utilisateurs hotspot et PPPoE sont créés, limités et expirés automatiquement, sans intervention manuelle.",
  },
  {
    title: "Paiement encaissé",
    description:
      "Mobile money, carte ou virement : chaque forfait vendu est facturé et réconcilié en temps réel.",
  },
  {
    title: "Suivi en temps réel",
    description:
      "Uptime, charge, utilisateurs actifs : tout votre réseau, visible depuis un tableau de bord unique.",
  },
] as const;

export const platformFeatures: {
  title: string;
  description: string;
  icon: GeoIconName;
}[] = [
  {
    title: "Facturation automatisée complète",
    description:
      "Du Mobile Money (MTN, Airtel) aux paiements par carte et virements bancaires, automatisez tout votre cycle de revenus.",
    icon: "billing",
  },
  {
    title: "Gestion avancée PPPoE et Hotspot",
    description:
      "Gérez facilement les utilisateurs PPPoE avec des quotas de données, des limites de débit et des profils personnalisés.",
    icon: "wifi",
  },
  {
    title: "Noyau RADIUS puissant",
    description:
      "Notre puissant serveur RADIUS cloud s'intègre au matériel que vous possédez déjà, indépendant du constructeur.",
    icon: "radius",
  },
  {
    title: "Système Agent et Point de Vente",
    description:
      "Notre fonctionnalité Agent unique permet à votre équipe de vendre des forfaits internet en espèces.",
    icon: "agent",
  },
  {
    title: "Analytique et rapports détaillés",
    description:
      "Surveillez la santé du réseau en temps réel, suivez l'utilisation des données et analysez la croissance de vos revenus.",
    icon: "growth",
  },
  {
    title: "Vouchers en quelques secondes",
    description:
      "Créez et imprimez des vouchers WiFi personnalisés en quelques secondes.",
    icon: "voucher",
  },
];

export const hardware: {
  name: string;
  description: string;
  icon: GeoIconName;
}[] = [
  {
    name: "MikroTik",
    description:
      "Intégration RouterOS approfondie : scripts d'installation automatiques, créateur de topologie visuelle, et synchronisation des profils hotspot/PPPoE.",
    icon: "router",
  },
  {
    name: "Ruijie Reyee",
    description:
      "Points d'accès et switches Reyee gérés depuis le cloud, facturés et surveillés depuis SafeLinkHub.",
    icon: "wifi",
  },
  {
    name: "TP-Link",
    description:
      "Gérez votre matériel TP-Link Omada au même endroit que le reste de votre réseau.",
    icon: "monitor",
  },
  {
    name: "Ubiquiti UniFi",
    description:
      "Intégrez les clients et sites de votre contrôleur UniFi à la facturation et l'analytique SafeLinkHub.",
    icon: "globe",
  },
];

// Les témoignages sont désormais de VRAIS avis soumis par les utilisateurs du
// site (table `testimonials`, modérés) — voir src/lib/testimonials/ et le
// composant Testimonials.tsx. Plus de faux témoignages en dur ici.

export const faqs = [
  {
    q: "Qu'est-ce que SafeLinkHub et à qui s'adresse-t-il ?",
    a: "SafeLinkHub est une plateforme de gestion FAI et de facturation hotspot conçue pour les opérateurs réseau, les propriétaires de hotspots et les FAI de toute taille.",
  },
  {
    q: "Comment fonctionne le système de facturation de SafeLinkHub ?",
    a: "SafeLinkHub automatise votre cycle de revenus : les clients paient par mobile money, carte ou virement bancaire, et les forfaits sont provisionnés et expirés automatiquement.",
  },
  {
    q: "Puis-je intégrer SafeLinkHub à mon réseau existant ?",
    a: "Oui. SafeLinkHub est indépendant du matériel et prend en charge MikroTik, Ruijie, TP-Link, Ubiquiti UniFi, Cambium, Cisco, D-Link et Huawei.",
  },
  {
    q: "Qu'est-ce qui est inclus dans le plan gratuit ?",
    a: "Le plan gratuit inclut la facturation hotspot de base, la génération de vouchers et la surveillance basique des routeurs pour tester SafeLinkHub avant de passer à un plan supérieur.",
  },
  {
    q: "Comment fonctionne la surveillance réseau ?",
    a: "SafeLinkHub interroge continuellement vos routeurs pour le temps de fonctionnement, les utilisateurs actifs, la charge CPU et l'utilisation mémoire, et affiche tout en temps réel.",
  },
  {
    q: "Mes données réseau sont-elles sécurisées ?",
    a: "Tous les accès distants passent par un tunnel de gestion chiffré, et vos données sont isolées par organisation.",
  },
] as const;

