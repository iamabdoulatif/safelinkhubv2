// Dictionnaire FRANÇAIS — référence.
//
// C'est ce fichier qui définit la forme : `en.ts` est typé `Dictionary`, donc
// toute clé oubliée ou mal orthographiée en anglais devient une ERREUR DE
// COMPILATION. Sur 483 chaînes, c'est le seul garde-fou qui tienne — une
// relecture humaine laisse toujours passer une clé.
//
// Ce qui n'est PAS traduit, volontairement : les noms de marque (SafeLinkHub,
// MikroTik, Safecoin, Orange Money…), les identifiants techniques (PPPoE,
// RADIUS, WinBox), et les MONTANTS, qui viennent de la configuration de
// facturation et restent en FCFA dans les deux langues.

export const fr = {
  nav: {
    features: "Fonctionnalités",
    platform: "Plateforme",
    shop: "Boutique",
    blog: "Blog",
    contact: "Contact",
    signIn: "Connexion",
    getStarted: "Commencer",
    dashboard: "Tableau de bord",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    mainNav: "Navigation principale",
    mobileNav: "Navigation mobile",
    home: "SafeLinkHub — accueil",
    switchTo: "English",
    switchLabel: "Changer de langue",
  },
  announce: {
    trial: (days: number) => `Essai offert : ${days} jours d'accès distant`,
    detail: " — sans carte bancaire, dès la création du compte.",
    cta: "Commencer",
    socials: "Réseaux sociaux",
  },
  hero: {
    eyebrow: "Facturation hotspot · Automatisation FAI",
    titleA: "Votre réseau. Vos revenus. ",
    titleMark: "Automatisés.",
    lead: "La plateforme d'automatisation Hotspot et FAI la plus avancée : facturation mobile money, provisionnement MikroTik et surveillance temps réel, depuis un seul tableau de bord.",
    emailLabel: "Adresse e-mail professionnelle",
    emailPlaceholder: "vous@votre-reseau.ci",
    submit: "Démarrer gratuitement",
    microcopy: (days: number) =>
      `Plan gratuit · ${days} jours d'accès distant offerts · sans carte bancaire`,
    watch: "Voir le tableau de bord en 60 secondes",
    cards: {
      routers: "Routeurs supervisés",
      routersSub: "parc total sur la plateforme",
      sessions: "Sessions en cours",
      sessionsSub: "sur les routeurs joignables",
      trial: "Essai offert",
      trialValue: (days: number) => `${days} jours`,
      trialSub: "accès distant, sans carte bancaire",
      mobileMoney: "Mobile money",
    },
    compatible: "Compatible avec",
  },
  trust: {
    heading: "Ce que SafeLinkHub supprime",
  },
  intro: {
    title: "Un seul script à coller.\nLe reste, la plateforme s'en charge.",
    body: "Pas de technicien à envoyer sur site, pas de configuration RouterOS à écrire à la main. Vous collez le script d'installation dans le terminal du routeur : SafeLinkHub pose le hotspot, les profils de forfaits, le portail captif et le tunnel de supervision, puis commence à encaisser.",
    link: "Voir comment",
  },
  provisioning: {
    aria: "Provisionnement automatique",
    eyebrow: "Provisionnement",
    titleMark: "Provisionnez",
    titleRest: " sans y penser.",
    lead: "Chaque client acheté est créé, limité, facturé puis expiré tout seul. Vous ne touchez plus à Winbox pour vendre une journée d'internet.",
    points: [
      "Hotspot, PPPoE et profils de forfaits créés en une passe",
      "Portail captif installé et relié à vos tarifs",
      "Expiration et coupure automatiques à échéance",
      "Tunnel de supervision monté sans ouvrir de port",
    ],
    cta: "Connecter un routeur",
    cardTitle: "Installation en cours",
    steps: [
      "Connexion à l'API RouterOS",
      "Serveur hotspot + pool DHCP",
      "6 profils de forfaits posés",
      "Portail captif installé",
      "Tunnel de supervision monté",
    ],
    done: "Routeur prêt à vendre",
  },
  payments: {
    aria: "Encaissement mobile money",
    eyebrow: "Paiements",
    titleA: "Les quatre opérateurs, ",
    titleMark: "un seul flux",
    lead: "Vos clients paient avec ce qu'ils ont déjà dans la poche. Vous ne gérez qu'un seul journal de recettes.",
    preview: "Aperçu de la console",
    example: "Exemple",
    collectedToday: "Encaissé aujourd'hui",
    reconciled:
      "Réconciliation automatique : chaque paiement est rattaché au forfait qu'il ouvre.",
    operators: [
      {
        name: "Orange Money",
        detail:
          "Encaissement direct depuis le portail captif. Le forfait s'active dès la confirmation de l'opérateur, sans intervention.",
      },
      {
        name: "MTN MoMo",
        detail:
          "Même parcours, même réconciliation. Chaque transaction est rapprochée du voucher qu'elle a payé.",
      },
      {
        name: "Wave",
        detail:
          "Les frais réduits de Wave se répercutent sur votre marge : le montant net est celui qui remonte au tableau de bord.",
      },
      {
        name: "Moov Money",
        detail:
          "Couverture complète des quatre opérateurs ivoiriens, sans agrégateur intermédiaire à rémunérer.",
      },
    ],
  },
  process: {
    aria: "Comment ça marche",
    eyebrow: "Comment ça marche",
    title: "Du carton au premier encaissement.",
    mark: "premier encaissement",
  },
  demo: {
    aria: "Démonstration produit",
    eyebrow: "Le produit",
    titleA: "Le tableau de bord qui pilote ",
    titleMark: "tout",
    lead: "Une console unique pour vos routeurs, vos forfaits et vos encaissements — et soixante secondes pour comprendre comment elle s'installe.",
    remoteAccess: "Accès distant",
    remoteAccessSub: "par service / mois",
    autoSetup: "Auto-setup routeur",
    autoSetupSub: "selon le matériel",
    trial: "Essai offert",
    trialSub: "accès distant gratuit dès la création du compte",
    vendorsSupported: (n: number) => `${n} constructeurs pris en charge`,
    radius: "Noyau RADIUS cloud inclus",
    videoTitle: "SafeLinkHub × MikroTik en 60 secondes",
    openYoutube: "Ouvrir sur YouTube",
    playLabel: (title: string) => `Lire la vidéo : ${title}`,
    playHint: "La vidéo est chargée depuis YouTube. Rien n'est envoyé tant que vous ne la lancez pas.",
  },
  features: {
    aria: "Fonctionnalités",
    eyebrow: "Fonctionnalités",
    title: "Arrêtez de jongler. Faites grandir votre réseau.",
    mark: "grandir",
    lead: "Tout ce qu'un opérateur hotspot fait à la main, la plateforme le fait à sa place — et le facture.",
  },
  platform: {
    aria: "Plateforme complète",
    eyebrow: "La plateforme",
    title: "Une plateforme complète pour un contrôle total.",
    mark: "contrôle total",
    lead: "Facturation, RADIUS, agents, analytique : les briques d'un FAI, sans en assembler aucune.",
  },
  hardware: {
    aria: "Compatibilité matérielle",
    titleA: "Une seule plateforme. ",
    titleMark: "Tout",
    titleB: " votre matériel.",
    lead: "SafeLinkHub est indépendant du constructeur : le noyau RADIUS cloud parle à ce que vous avez déjà en rack.",
    native: "Intégration native",
  },
  reseller: {
    aria: "Comptes utilisateur et revendeur",
    eyebrow: "Techniciens & revendeurs",
    title: "Vous en posez plusieurs par mois ?",
    mark: "plusieurs par mois",
    lead: "Le compte revendeur ramène l'installation d'un MikroTik à un prix d'intégrateur. Le pack se paie une fois par an et revient intégralement en crédit.",
    user: {
      name: "Utilisateur",
      tagline: "Un ou deux MikroTik par an",
      price: "Gratuit",
      priceNote: "Rien à payer à l'inscription",
      cta: "Créer un compte",
      points: (setup: string, container: string) => [
        `Installation à ${setup} — ${container} avec conteneur`,
        "Premier routeur installé gratuitement",
        "10 jours d'accès distant offerts",
        "Facturation mobile money et vouchers illimités",
      ],
    },
    pro: {
      name: "Technicien ou revendeur",
      tagline: "Plusieurs MikroTik par mois",
      priceNote: "par an — reversés en crédit sur votre portefeuille",
      cta: "Devenir revendeur",
      discount: (pct: number) => `Remise ${pct} %`,
      points: (quota: number, fee: string, normal: string) => [
        `${quota} installations à ${fee} au lieu de ${normal}`,
        "Tarif unique, que la carte accepte les conteneurs ou non",
        "Le montant du pack revient en totalité sur votre portefeuille",
        "Quota remis à zéro à chaque renouvellement annuel",
      ],
    },
    footnote: (quota: number, saving: string) =>
      `Sur ${quota} installations, le pack revendeur représente ${saving} d'économie. Le statut se demande à l'inscription et s'active au paiement du pack.`,
  },
  faq: {
    aria: "Questions fréquentes",
    eyebrow: "FAQ",
    title: "Questions fréquentes.",
    lead: "Ce qu'on nous demande avant de connecter un premier routeur.",
  },
  finalCta: {
    aria: "Créer un compte",
    title: "Prêt à automatiser votre réseau ?",
    lead: "Commencez gratuitement. Aucune carte bancaire requise, aucun engagement.",
    primary: "Créer un compte gratuit",
    secondary: "Demander une démo",
  },
  footer: {
    tagline: "Le réseau commence ici.",
    subtitle:
      "Créez votre compte en deux minutes et connectez votre premier routeur aujourd'hui.",
    emailLabel: "Adresse e-mail",
    submit: "Créer un compte",
    address:
      "Plateforme d'automatisation Hotspot et FAI. Abidjan, Côte d'Ivoire.",
    columns: {
      product: "Produit",
      company: "Entreprise",
      resources: "Ressources",
    },
    links: {
      home: "Accueil",
      features: "Fonctionnalités",
      platform: "Plateforme",
      pricing: "Tarifs",
      faq: "FAQ",
      shop: "Boutique",
      getStarted: "Commencer",
      contact: "Contact",
      careers: "Carrières",
      blog: "Blog",
      terms: "Conditions d'utilisation",
      privacy: "Politique de confidentialité",
      support: "Support",
    },
    rights: (year: number) => `© ${year} SafeLinkHub. Tous droits réservés.`,
    socials: "Réseaux sociaux",
  },
  /* Contenu éditorial. La STRUCTURE (icône, largeur de colonne) reste dans
     content.ts ; seul le texte vit ici, dans le même ordre. Un test vérifie que
     les longueurs concordent — un décalage d'un cran associerait la mauvaise
     icône au mauvais titre, sans rien casser visiblement. */
  content: {
    painPoints: [
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
    ],
    quickFeatures: [
      {
        title: "Facturation hotspot intelligente",
        description: "Vendez des forfaits à la durée ou aux données, acceptez le mobile money, et voyez vos revenus arriver sur votre tableau de bord en temps réel.",
      },
      {
        title: "Surveillance réseau en temps réel",
        description: "Suivez le temps de fonctionnement, les utilisateurs actifs, la charge CPU et mémoire de chaque routeur, instantanément.",
      },
      {
        title: "Intégration en un clic",
        description: "Connectez n'importe quel routeur MikroTik RouterOS avec un seul script d'installation.",
      },
      {
        title: "Gestion depuis le cloud",
        description: "Gérez tous vos sites et routeurs depuis un seul tableau de bord central.",
      },
      {
        title: "Utilisateurs automatisés",
        description: "Provisionnez, expirez et facturez automatiquement les utilisateurs hotspot et PPPoE.",
      },
      {
        title: "Solutions FAI évolutives",
        description: "Passez d'un simple hotspot à un FAI multi-sites sans changer d'outils.",
      },
    ],
    processSteps: [
      {
        title: "Connexion instantanée",
        description: "Connectez n'importe quel routeur MikroTik en un seul script. Aucune configuration manuelle, aucun technicien sur site.",
      },
      {
        title: "Provisionnement automatique",
        description: "Vos utilisateurs hotspot et PPPoE sont créés, limités et expirés automatiquement, sans intervention manuelle.",
      },
      {
        title: "Paiement encaissé",
        description: "Mobile money, carte ou virement : chaque forfait vendu est facturé et réconcilié en temps réel.",
      },
      {
        title: "Suivi en temps réel",
        description: "Uptime, charge, utilisateurs actifs : tout votre réseau, visible depuis un tableau de bord unique.",
      },
    ],
    platformFeatures: [
      {
        title: "Facturation automatisée complète",
        description: "Du Mobile Money (MTN, Airtel) aux paiements par carte et virements bancaires, automatisez tout votre cycle de revenus.",
      },
      {
        title: "Gestion avancée PPPoE et Hotspot",
        description: "Gérez facilement les utilisateurs PPPoE avec des quotas de données, des limites de débit et des profils personnalisés.",
      },
      {
        title: "Noyau RADIUS puissant",
        description: "Notre puissant serveur RADIUS cloud s'intègre au matériel que vous possédez déjà, indépendant du constructeur.",
      },
      {
        title: "Système Agent et Point de Vente",
        description: "Notre fonctionnalité Agent unique permet à votre équipe de vendre des forfaits internet en espèces.",
      },
      {
        title: "Analytique et rapports détaillés",
        description: "Surveillez la santé du réseau en temps réel, suivez l'utilisation des données et analysez la croissance de vos revenus.",
      },
      {
        title: "Vouchers en quelques secondes",
        description: "Créez et imprimez des vouchers WiFi personnalisés en quelques secondes.",
      },
    ],
    hardware: [
      {
        name: "MikroTik",
        description: "Intégration RouterOS approfondie : scripts d'installation automatiques, créateur de topologie visuelle, et synchronisation des profils hotspot/PPPoE.",
      },
      {
        name: "Ruijie Reyee",
        description: "Points d'accès et switches Reyee gérés depuis le cloud, facturés et surveillés depuis SafeLinkHub.",
      },
      {
        name: "TP-Link",
        description: "Gérez votre matériel TP-Link Omada au même endroit que le reste de votre réseau.",
      },
      {
        name: "Ubiquiti UniFi",
        description: "Intégrez les clients et sites de votre contrôleur UniFi à la facturation et l'analytique SafeLinkHub.",
      },
    ],
    faqs: [
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
        q: "Qu'est-ce que le Safecoin ?",
        a: "Safecoin (SC) est le crédit interne de SafeLinkHub : 1 SC vaut actuellement 100 FCFA. Vous rechargez votre solde une fois, puis il sert à activer vos accès VPN et vos Auto-Setup. Les quotas offerts et promotions ne débitent pas de Safecoin.",
      },
      {
        q: "Comment fonctionne la surveillance réseau ?",
        a: "SafeLinkHub interroge continuellement vos routeurs pour le temps de fonctionnement, les utilisateurs actifs, la charge CPU et l'utilisation mémoire, et affiche tout en temps réel.",
      },
      {
        q: "Mes données réseau sont-elles sécurisées ?",
        a: "Tous les accès distants passent par un tunnel de gestion chiffré, et vos données sont isolées par organisation.",
      },
    ],
  },
  backToTop: "Retour en haut",
} as const;

/* `as const` fige les chaînes en types littéraux : `en` typé `typeof fr`
 * exigerait les MÊMES mots, ce qui n'a aucun sens. On élargit donc les
 * littéraux en `string` tout en gardant la structure — clés, tableaux et
 * signatures de fonctions restent vérifiés.
 *
 * Effet recherché : une clé oubliée, mal orthographiée ou dont la signature
 * change devient une erreur de compilation, jamais un mot français resté en
 * production. */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : T extends (...args: infer A) => infer R
        ? (...args: A) => R
        : { -readonly [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof fr>;
