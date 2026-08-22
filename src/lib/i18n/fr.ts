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
    servicesMenu: {
      label: "Services",
      vpnTitle: "VPN MikroTik",
      vpnText: "Tunnel chiffré vers chaque routeur, même derrière un CGNAT.",
      hotspotTitle: "Hotspot",
      hotspotText: "Portail captif, tickets et encaissement mobile money.",
      cameraTitle: "Caméra de surveillance",
      cameraText: "Vidéosurveillance raccordée au même réseau.",
      firewallTitle: "FireWall",
      firewallText: "Filtrage, segmentation et protection du réseau.",
      all: "Voir tous les services",
    },
    services: "Services",
    vpn: "VPN",
    training: "Formations",
    search: "Rechercher",
    searchLabel: "Rechercher sur le site",
    shop: "Boutique",
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
    routerAlt: "Routeur MikroTik Chateau Pro géré dans SafeLinkHub",
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
    fromPrice: (amount: string) => `dès ${amount} FCFA`,
    trialValue: (days: number) => `${days} jours`,
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
    emailPlaceholder: "vous@votre-reseau.ci",
    submit: "Créer un compte",
    address:
      "Plateforme d'automatisation Hotspot et FAI. Abidjan, Côte d'Ivoire.",
    columns: {
      product: "Produit",
      company: "Entreprise",
      resources: "Ressources",
    },
    links: {
      services: "Services",
      vpn: "VPN et accès distant",
      training: "Formations",
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
  pricing: {
    periods: { monthly: "1 mois", quarterly: "3 mois", semiannual: "6 mois", yearly: "12 mois" },
    services: {
      mikhmon: "MikHmon (vouchers)",
      webfig: "WebFig (navigateur)",
      winbox: "WinBox",
      ssh: "SSH / SFTP",
    },
    aria: "Tarifs",
    eyebrow: "Tarifs",
    title: "Des tarifs clairs, sans surprise.",
    marker: "clairs",
    lead: "Chiffres réels, importés de la configuration de facturation — pas d'astérisque, pas de « à partir de » masqué.",
    remote: {
      title: "Accès distant sécurisé",
      sub: "Tunnel chiffré vers votre MikroTik, par service et par durée.",
      note: (rate: string) =>
        `Même tarif pour chaque service. Conversion affichée au taux 1 SC = ${rate} FCFA.`,
    },
    autoSetup: {
      title: "Installation auto-setup",
      sub: "Configuration complète du routeur en un clic.",
      containerLabel: "Routeur Hotspot + MikHmon",
      containerSub: "Cartes compatibles conteneur",
      hotspotLabel: "Hotspot seul",
      hotspotSub: "Matériel plus léger (RB951…)",
      note: "Frais unique · liage et tunnel gratuits.",
    },
    trial: {
      eyebrow: "Offert au démarrage",
      headline: (days: number) => `${days} jours d'accès distant gratuits`,
      perks: [
        "WinBox, WebFig, SSH/SFTP & MikHmon inclus",
        "Vouchers WiFi illimités",
        "Aucune carte requise",
      ],
      cta: "Commencer gratuitement",
    },
  },
  safecoin: {
    aria: "Safecoin",
    eyebrow: "Safecoin",
    title: "Le réseau avance avec Safecoin.",
    marker: "Safecoin",
    lead: "Un crédit prépayé unique : vous rechargez une fois, puis vous activez accès distant et auto-setup sans repasser par un paiement.",
    card: {
      badge: "SFC / crédit opérateur",
      tagline: "La monnaie interne de votre réseau.",
      rateLabel: "Taux de référence",
      rateNote: "Un solde prépayé, lisible et maîtrisé pour activer vos services sans jongler entre plusieurs paiements.",
    },
    flow: {
      eyebrow: "Le circuit en trois gestes",
      title: "Rechargez une fois. Gardez la main sur chaque dépense.",
      steps: [
        { number: "01", title: "Recharge", text: "Ajoutez des FCFA par votre passerelle de paiement." },
        { number: "02", title: "Crédit", text: "Votre compte reçoit automatiquement ses SC." },
        { number: "03", title: "Activation", text: "VPN et Auto-Setup débitent le bon montant." },
      ],
      perks: [
        "Historique de chaque mouvement",
        "Frais visibles avant activation",
        "Promos gratuites hors débit",
      ],
    },
    usage: {
      title: "Repères de consommation",
      sub: "Accès distant · par service et par période",
      badge: "base actuelle",
      note: "Tarif de base par service. Les frais Safecoin configurés par l’administrateur sont affichés avant chaque débit.",
    },
    setup: {
      eyebrow: "Auto-Setup",
      title: "Un budget clair pour chaque installation.",
      hotspotOnly: "Hotspot seul",
      withContainer: "Avec conteneur",
      cta: "Ouvrir mon compte Safecoin",
    },
    disclaimer: "Safecoin est un crédit interne de SafeLinkHub, pas une cryptomonnaie. Le taux et les frais sont pilotés depuis la station de contrôle ; les quotas offerts, parrainages et récompenses restent gratuits.",
  },
  testimonials: {
    aria: "Témoignages",
    eyebrow: "Témoignages",
    title: "Ce que disent nos utilisateurs.",
    marker: "utilisateurs",
    lead: "Des avis réels, soumis depuis cette page et publiés après validation.",
    ratingLabel: (n: number) => `${n} sur 5`,
    fallbackRole: "Utilisateur SafeLinkHub",
    empty: {
      title: "Soyez le premier à partager votre expérience.",
      text: "Vous utilisez SafeLinkHub ? Racontez-nous — votre témoignage apparaîtra ici après validation.",
    },
    form: {
      title: "Partagez votre témoignage",
      lead: "Vous utilisez SafeLinkHub ? Dites-nous ce que vous en pensez.",
      name: "Nom *",
      role: "Rôle",
      rolePlaceholder: "Opérateur FAI, gérant de hotspot…",
      company: "Entreprise",
      rating: "Note",
      // Tableau et non fonction : ce bloc traverse la frontière serveur/client
      // (TestimonialForm est "use client"), qui refuse les fonctions.
      starLabels: ["1 étoile", "2 étoiles", "3 étoiles", "4 étoiles", "5 étoiles"],
      quote: "Votre témoignage *",
      submit: "Envoyer mon témoignage",
      sending: "Envoi…",
      thanksTitle: "Merci !",
      thanksText: "Votre témoignage a bien été envoyé. Il apparaîtra ici après validation.",
    },
  },
  blogTeaser: {
    aria: "Derniers articles",
    eyebrow: "Le blog",
    title: "Ce que nos opérateurs apprennent sur le terrain.",
    marker: "sur le terrain",
    all: "Tous les articles",
  },
  blog: {
    journal: "Journal SafeLinkHub",
    title: "Le blog",
    titleMark: "techno",
    lead: "Guides MikroTik, mobile money, automatisation FAI et coulisses produit — pour gérer et monétiser votre réseau Wi-Fi.",
    searchPlaceholder: "rechercher un article, un sujet…",
    searchLabel: "Rechercher dans le blog",
    clearSearch: "Effacer la recherche",
    articleOne: "article",
    articleMany: "articles",
    topicOne: "sujet",
    topicMany: "sujets",
    topics: "Sujets",
    allTopics: "Tous",
    noMatches: "Aucun article ne correspond à ce filtre.",
    noPosts: "Aucun article pour le moment.",
    tryAgain: "Essayez un autre sujet ou effacez la recherche.",
    checkBack: "Revenez bientôt — les premiers articles arrivent.",
    advertising: "Publicité",
    readArticle: "Lire l'article",
    allArticles: "Tous les articles",
  },
  contact: {
    eyebrow: "Entreprise",
    title: "Contactez-nous",
    lead: "Une question sur le produit, un partenariat ou un déploiement à grande échelle ? Écrivez-nous, nous répondons rapidement.",
    customerTitle: "Déjà client ?",
    customerText: "Pour toute question liée à votre compte ou à vos routeurs, passez par l'onglet Support de votre tableau de bord : votre demande sera rattachée à votre organisation.",
    openSupport: "Ouvrir le support",
    responseTitle: "Délai de réponse",
    responseText: "Nous traitons les messages du lundi au samedi. Comptez en général moins de 24 heures ouvrées pour une première réponse.",
    form: {
      success: "Message envoyé — merci, nous revenons vers vous rapidement.",
      name: "Nom",
      namePlaceholder: "Votre nom",
      email: "Email",
      emailPlaceholder: "vous@exemple.com",
      subject: "Sujet",
      optional: "optionnel",
      subjectPlaceholder: "Ex : Déploiement multi-sites",
      message: "Message",
      messagePlaceholder: "Décrivez votre besoin…",
      sending: "Envoi…",
      submit: "Envoyer le message",
    },
    map: {
      findUs: "Nous trouver",
      directions: "Itinéraire",
      title: "Carte",
      show: "Afficher la carte",
      privacy: "La carte est chargée depuis Google. Rien n'est envoyé tant que vous ne l'ouvrez pas.",
    },
  },
  boutique: {
    title: "Site en construction",
    lead: "Notre boutique d'équipement (routeurs MikroTik, antennes, switchs PoE et accessoires) arrive très bientôt, avec son propre espace dédié. Revenez la découvrir prochainement.",
    backHome: "Retour à l'accueil",
    countdown: "Retour à l'accueil dans",
    secondOne: "seconde",
    secondMany: "secondes",
    redirecting: "Redirection en cours…",
    footer: "SafeLinkHub · Boutique",
  },
  servicesPage: {
    eyebrow: "Services",
    heading: "Tout ce que SafeLinkHub fait tourner à votre place.",
    lead: "Provisionnement des routeurs, portail captif, encaissement mobile money, supervision du parc et matériel compatible : le détail de chaque brique, réuni au même endroit.",
    metaTitle: "Services | SafeLinkHub",
    metaDescription: "Provisionnement MikroTik, portail captif, mobile money, supervision : le détail des services SafeLinkHub.",
  },
  vpnPage: {
    eyebrow: "Accès distant",
    heading: "Vos MikroTik, joignables de partout.",
    lead: "Un tunnel chiffré vers chaque routeur : WinBox, WebFig, SSH et MikHmon, sans IP publique et même derrière un CGNAT. Les tarifs ci-dessous sortent de la configuration de facturation, sans astérisque.",
    metaTitle: "VPN et accès distant | SafeLinkHub",
    metaDescription: "Tunnel chiffré vers vos MikroTik : WinBox, WebFig, SSH et MikHmon, même derrière un CGNAT. Tarifs réels.",
  },
  trainingPage: {
    eyebrow: "Formations",
    heading: "Apprendre à faire tourner un réseau qui rapporte.",
    lead: "Des parcours suivis pas à pas pour installer, sécuriser et monétiser un hotspot MikroTik — et les articles du terrain pour approfondir.",
    heroCta: "Parcourir les guides",
    heroSecondary: "Voir les services",
    benefitsTitle: "Pourquoi ces contenus",
    benefits: [
      {
        title: "Écrit depuis le terrain",
        text: "Chaque guide vient d'un déploiement réel : les réglages qui ont marché, et ceux qui ont échoué.",
      },
      {
        title: "Du MikroTik concret",
        text: "Des commandes RouterOS à recopier, pas de la théorie. Vous suivez, vous appliquez.",
      },
      {
        title: "Lisible sur téléphone",
        text: "Autant de terrain que de bureau : les guides se lisent debout, à côté de la baie.",
      },
      {
        title: "En accès libre",
        text: "Aucun compte, aucun paiement. Les contenus sont ouverts, et le resteront.",
      },
    ],
    categoriesTitle: "Explorer par thème",
    categoriesLead: "Les sujets couverts aujourd'hui, et le nombre de guides pour chacun.",
    categoryCount: (n: number) => `${n} guide${n > 1 ? "s" : ""}`,
    ctaTitle: "Prêt à monter votre premier hotspot ?",
    ctaText: "Créez votre compte : trente jours d'accès distant sont offerts, sans carte bancaire.",
    ctaButton: "Commencer gratuitement",
    coursesTitle: "Parcours",
    coursesEmpty: "Les premiers parcours arrivent. En attendant, les articles ci-dessous couvrent l'essentiel.",
    lessonsCount: (n: number) => `${n} leçon${n > 1 ? "s" : ""}`,
    articlesTitle: "Articles et guides",
    articlesLead: "Publiés au fil du terrain, en accès libre.",
    allArticles: "Tous les articles",
    startCourse: "Commencer le parcours",
    readArticle: "Lire l’article complet",
    backToTraining: "← Toutes les formations",
    metaTitle: "Formations | SafeLinkHub",
    metaDescription: "Parcours et guides pour installer, sécuriser et monétiser un hotspot Wi-Fi MikroTik.",
  },
  searchPage: {
    eyebrow: "Recherche",
    heading: "Chercher sur SafeLinkHub",
    placeholder: "Un routeur, un réglage, une question…",
    submit: "Rechercher",
    resultsFor: (n: number, q: string) =>
      `${n} résultat${n > 1 ? "s" : ""} pour « ${q} »`,
    empty: (q: string) => `Rien ne correspond à « ${q} ».`,
    hint: "Essayez un mot plus court, ou parcourez les formations et les services.",
    prompt: "Tapez ce que vous cherchez : une page, un guide, un parcours.",
    kinds: { page: "Page", article: "Article", course: "Formation" },
    metaTitle: "Recherche | SafeLinkHub",
    metaDescription: "Chercher une page, un guide ou une formation sur SafeLinkHub.",
  },
  servicePages: {
    hotspot: {
      eyebrow: "Service",
      heading: "Hotspot Wi-Fi",
      lead: "Le portail captif, les tickets et l'encaissement, sur vos propres MikroTik.",
      points: [
        {
          title: "Portail captif à votre marque",
          text: "Vos couleurs, votre logo, vos forfaits. Le client se connecte, choisit, paie et repart connecté sans qu'un agent intervienne.",
        },
        {
          title: "Tickets et comptes nominatifs",
          text: "Génération en lot, impression, revente par vos agents, et comptes durables pour les abonnés réguliers.",
        },
        {
          title: "Encaissement mobile money",
          text: "Orange Money, MTN MoMo, Wave et Moov Money. Le paiement crée le ticket et l'envoie par SMS, sans manipulation.",
        },
        {
          title: "Supervision du parc",
          text: "Routeurs en ligne, sessions en cours, ventes du jour : l'état réel de chaque zone au même endroit.",
        },
      ],
      cta: "Ouvrir un compte",
    },
    camera: {
      eyebrow: "Service",
      heading: "Caméra de surveillance",
      lead: "Raccorder la vidéosurveillance au réseau que vous exploitez déjà.",
      /* Aucune promesse de fonctionnalité : cette offre n'est pas encore
         construite dans le produit. Annoncer des capacités inexistantes se
         paierait au premier client qui les demanderait. */
      soon: "Cette offre est en préparation. Le réseau, les tunnels et la supervision existent déjà ; la partie vidéo, elle, reste à bâtir. Si vous avez un site à équiper, décrivez-nous le besoin : cela orientera ce que nous construisons d'abord.",
      cta: "Décrire mon besoin",
    },
    firewall: {
      eyebrow: "Service",
      heading: "FireWall",
      lead: "Filtrage, segmentation et protection du réseau.",
      soon: "Cette offre est en préparation. Vos MikroTik appliquent déjà des règles de pare-feu posées par l'auto-configuration ; une offre de sécurité gérée, avec règles sur mesure et suivi, reste à construire. Dites-nous ce que vous devez protéger.",
      cta: "Décrire mon besoin",
    },
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
