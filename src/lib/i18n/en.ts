// ENGLISH dictionary.
//
// Typed as `Dictionary`, whose shape comes from `fr.ts`: a missing, misspelled
// or wrongly-shaped key is a COMPILE ERROR, never a French string left in
// production.
//
// Deliberately NOT translated: brand names (SafeLinkHub, MikroTik, Safecoin,
// Orange Money…), technical identifiers (PPPoE, RADIUS, WinBox), and amounts,
// which come from the billing configuration and stay in FCFA in both languages.

import type { Dictionary } from "./fr";

export const en: Dictionary = {
  nav: {
    servicesMenu: {
      label: "Services",
      vpnTitle: "MikroTik VPN",
      vpnText: "Encrypted tunnel to every router, even behind a CGNAT.",
      hotspotTitle: "Hotspot",
      hotspotText: "Captive portal, tickets and mobile money collection.",
      cameraTitle: "Security cameras",
      cameraText: "Video surveillance wired into the same network.",
      firewallTitle: "FireWall",
      firewallText: "Filtering, segmentation and network protection.",
      all: "See all services",
    },
    services: "Services",
    vpn: "VPN",
    blog: "Blog",
    training: "Training",
    search: "Search",
    searchLabel: "Search the site",
    shop: "Shop",
    contact: "Contact",
    signIn: "Sign in",
    getStarted: "Get started",
    dashboard: "Dashboard",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    mainNav: "Main navigation",
    mobileNav: "Mobile navigation",
    home: "SafeLinkHub — home",
    switchTo: "Français",
    switchLabel: "Change language",
  },
  announce: {
    trial: (days: number) => `Free trial: ${days} days of remote access`,
    detail: " — no card required, from the moment you sign up.",
    cta: "Get started",
    socials: "Social networks",
  },
  hero: {
    eyebrow: "Hotspot billing · ISP automation",
    titleA: "Your network. Your revenue. ",
    titleMark: "Automated.",
    lead: "The most advanced Hotspot and ISP automation platform: mobile money billing, MikroTik provisioning and real-time monitoring, from a single dashboard.",
    emailLabel: "Work email address",
    emailPlaceholder: "you@your-network.ci",
    submit: "Start for free",
    microcopy: (days: number) =>
      `Free plan · ${days} days of remote access included · no card required`,
    watch: "See the dashboard in 60 seconds",
    routerAlt: "MikroTik Chateau Pro router managed in SafeLinkHub",
    cards: {
      routers: "Routers monitored",
      routersSub: "total fleet on the platform",
      sessions: "Live sessions",
      sessionsSub: "on reachable routers only",
      trial: "Free trial",
      trialValue: (days: number) => `${days} days`,
      trialSub: "remote access, no card required",
      mobileMoney: "Mobile money",
    },
    compatible: "Works with",
  },
  trust: {
    heading: "What SafeLinkHub takes off your hands",
  },
  intro: {
    title: "One script to paste.\nThe platform handles the rest.",
    body: "No technician to send on site, no RouterOS configuration to write by hand. You paste the install script into the router's terminal: SafeLinkHub sets up the hotspot, the plan profiles, the captive portal and the monitoring tunnel — then starts collecting.",
    link: "See how",
  },
  provisioning: {
    aria: "Automatic provisioning",
    eyebrow: "Provisioning",
    titleMark: "Provision",
    titleRest: " without thinking about it.",
    lead: "Every customer who buys is created, rate-limited, billed and expired on its own. You no longer open Winbox to sell a day of internet.",
    points: [
      "Hotspot, PPPoE and plan profiles created in one pass",
      "Captive portal installed and wired to your prices",
      "Automatic expiry and cut-off at term",
      "Monitoring tunnel established without opening a port",
    ],
    cta: "Connect a router",
    cardTitle: "Installation in progress",
    steps: [
      "Connecting to the RouterOS API",
      "Hotspot server + DHCP pool",
      "6 plan profiles installed",
      "Captive portal installed",
      "Monitoring tunnel established",
    ],
    done: "Router ready to sell",
  },
  payments: {
    aria: "Mobile money collection",
    eyebrow: "Payments",
    titleA: "Four operators, ",
    titleMark: "one single flow",
    lead: "Your customers pay with what they already have in their pocket. You keep a single revenue ledger.",
    preview: "Console preview",
    example: "Example",
    collectedToday: "Collected today",
    reconciled:
      "Automatic reconciliation: every payment is tied to the plan it unlocks.",
    operators: [
      {
        name: "Orange Money",
        detail:
          "Collected straight from the captive portal. The plan activates as soon as the operator confirms, with no intervention.",
      },
      {
        name: "MTN MoMo",
        detail:
          "Same journey, same reconciliation. Every transaction is matched to the voucher it paid for.",
      },
      {
        name: "Wave",
        detail:
          "Wave's lower fees flow straight to your margin: the amount reaching your dashboard is the net one.",
      },
      {
        name: "Moov Money",
        detail:
          "Full coverage of all four Ivorian operators, with no intermediary aggregator to pay.",
      },
    ],
  },
  process: {
    aria: "How it works",
    eyebrow: "How it works",
    title: "From the box to the first payment.",
    mark: "first payment",
  },
  demo: {
    fromPrice: (amount) => `from ${amount} FCFA`,
    trialValue: (days) => `${days} days`,
    aria: "Product demonstration",
    eyebrow: "The product",
    titleA: "The dashboard that runs ",
    titleMark: "everything",
    lead: "A single console for your routers, your plans and your revenue — and sixty seconds to see how it installs.",
    remoteAccess: "Remote access",
    remoteAccessSub: "per service / month",
    autoSetup: "Router auto-setup",
    autoSetupSub: "depending on hardware",
    trial: "Free trial",
    trialSub: "remote access free from the moment you sign up",
    vendorsSupported: (n: number) => `${n} vendors supported`,
    radius: "Cloud RADIUS core included",
    videoTitle: "SafeLinkHub × MikroTik in 60 seconds",
    openYoutube: "Open on YouTube",
    playLabel: (title: string) => `Play video: ${title}`,
    playHint: "The video loads from YouTube. Nothing is sent until you play it.",
  },
  features: {
    aria: "Features",
    eyebrow: "Features",
    title: "Stop juggling. Grow your network.",
    mark: "Grow",
    lead: "Everything a hotspot operator does by hand, the platform does instead — and bills for it.",
  },
  platform: {
    aria: "Complete platform",
    eyebrow: "The platform",
    title: "A complete platform for total control.",
    mark: "total control",
    lead: "Billing, RADIUS, agents, analytics: the building blocks of an ISP, with none to assemble.",
  },
  hardware: {
    aria: "Hardware compatibility",
    titleA: "One platform. ",
    titleMark: "All",
    titleB: " your hardware.",
    lead: "SafeLinkHub is vendor-independent: the cloud RADIUS core speaks to what you already have in the rack.",
    native: "Native integration",
  },
  reseller: {
    aria: "User and reseller accounts",
    eyebrow: "Technicians & resellers",
    title: "Installing several a month?",
    mark: "several a month",
    lead: "The reseller account brings a MikroTik installation down to an integrator's price. The pack is paid once a year and comes back in full as credit.",
    user: {
      name: "User",
      tagline: "One or two MikroTiks a year",
      price: "Free",
      priceNote: "Nothing to pay at sign-up",
      cta: "Create an account",
      points: (setup: string, container: string) => [
        `Installation at ${setup} — ${container} with container`,
        "First router installed free of charge",
        "10 days of remote access included",
        "Mobile money billing and unlimited vouchers",
      ],
    },
    pro: {
      name: "Technician or reseller",
      tagline: "Several MikroTiks a month",
      priceNote: "per year — returned as credit to your wallet",
      cta: "Become a reseller",
      discount: (pct: number) => `${pct}% off`,
      points: (quota: number, fee: string, normal: string) => [
        `${quota} installations at ${fee} instead of ${normal}`,
        "One flat rate, whether or not the board supports containers",
        "The full pack amount comes back to your wallet",
        "Quota reset to zero on every yearly renewal",
      ],
    },
    footnote: (quota: number, saving: string) =>
      `Across ${quota} installations, the reseller pack saves ${saving}. The status is requested at sign-up and activates when the pack is paid.`,
  },
  faq: {
    aria: "Frequently asked questions",
    eyebrow: "FAQ",
    title: "Frequently asked questions.",
    lead: "What people ask us before connecting a first router.",
  },
  finalCta: {
    aria: "Create an account",
    title: "Ready to automate your network?",
    lead: "Start for free. No card required, no commitment.",
    primary: "Create a free account",
    secondary: "Request a demo",
  },
  footer: {
    tagline: "The network starts here.",
    subtitle:
      "Create your account in two minutes and connect your first router today.",
    emailLabel: "Email address",
    emailPlaceholder: "you@your-network.ci",
    submit: "Create an account",
    address: "Hotspot and ISP automation platform. Abidjan, Côte d'Ivoire.",
    columns: {
      product: "Product",
      company: "Company",
      resources: "Resources",
    },
    links: {
      services: "Services",
      vpn: "VPN and remote access",
      training: "Training",
      home: "Home",
      features: "Features",
      platform: "Platform",
      pricing: "Pricing",
      faq: "FAQ",
      shop: "Shop",
      getStarted: "Get started",
      contact: "Contact",
      careers: "Careers",
      blog: "Blog",
      terms: "Terms of use",
      privacy: "Privacy policy",
      support: "Support",
    },
    rights: (year: number) => `© ${year} SafeLinkHub. All rights reserved.`,
    socials: "Social networks",
  },
  content: {
    painPoints: [
      {
        fix: "Automatic provisioning",
        pain: "No more creating PPPoE users and vouchers by hand.",
      },
      {
        fix: "Centralised billing",
        pain: "No more tracking payments across spreadsheets and scattered tools.",
      },
      {
        fix: "Unified dashboard",
        pain: "No more revenue lost for lack of real-time visibility.",
      },
    ],
    quickFeatures: [
      {
        title: "Smart hotspot billing",
        description:
          "Sell plans by time or by data, accept mobile money, and watch your revenue land on your dashboard in real time.",
      },
      {
        title: "Real-time network monitoring",
        description:
          "Track uptime, active users, CPU and memory load on every router, instantly.",
      },
      {
        title: "One-click integration",
        description:
          "Connect any MikroTik RouterOS router with a single install script.",
      },
      {
        title: "Cloud management",
        description:
          "Run all your sites and routers from one central dashboard.",
      },
      {
        title: "Automated users",
        description:
          "Provision, expire and bill hotspot and PPPoE users automatically.",
      },
      {
        title: "Scalable ISP solutions",
        description:
          "Grow from a single hotspot to a multi-site ISP without changing tools.",
      },
    ],
    processSteps: [
      {
        title: "Instant connection",
        description:
          "Connect any MikroTik router with a single script. No manual configuration, no technician on site.",
      },
      {
        title: "Automatic provisioning",
        description:
          "Your hotspot and PPPoE users are created, rate-limited and expired automatically, with no manual step.",
      },
      {
        title: "Payment collected",
        description:
          "Mobile money, card or transfer: every plan sold is billed and reconciled in real time.",
      },
      {
        title: "Real-time tracking",
        description:
          "Uptime, load, active users: your whole network, visible from a single dashboard.",
      },
    ],
    platformFeatures: [
      {
        title: "Complete automated billing",
        description:
          "From Mobile Money (MTN, Airtel) to card payments and bank transfers, automate your entire revenue cycle.",
      },
      {
        title: "Advanced PPPoE and Hotspot management",
        description:
          "Manage PPPoE users easily with data quotas, rate limits and custom profiles.",
      },
      {
        title: "Powerful RADIUS core",
        description:
          "Our powerful cloud RADIUS server works with the hardware you already own, whatever the vendor.",
      },
      {
        title: "Agent and Point of Sale system",
        description:
          "Our unique Agent feature lets your team sell internet plans in cash.",
      },
      {
        title: "Detailed analytics and reports",
        description:
          "Monitor network health in real time, track data usage and analyse your revenue growth.",
      },
      {
        title: "Vouchers in seconds",
        description: "Create and print custom WiFi vouchers in seconds.",
      },
    ],
    hardware: [
      {
        name: "MikroTik",
        description:
          "Deep RouterOS integration: automatic install scripts, visual topology builder, and hotspot/PPPoE profile sync.",
      },
      {
        name: "Ruijie Reyee",
        description:
          "Reyee access points and switches, cloud-managed, billed and monitored from SafeLinkHub.",
      },
      {
        name: "TP-Link",
        description:
          "Manage your TP-Link Omada hardware in the same place as the rest of your network.",
      },
      {
        name: "Ubiquiti UniFi",
        description:
          "Bring your UniFi controller's clients and sites into SafeLinkHub billing and analytics.",
      },
    ],
    faqs: [
      {
        q: "What is SafeLinkHub and who is it for?",
        a: "SafeLinkHub is an ISP management and hotspot billing platform built for network operators, hotspot owners and ISPs of every size.",
      },
      {
        q: "How does SafeLinkHub billing work?",
        a: "SafeLinkHub automates your revenue cycle: customers pay by mobile money, card or bank transfer, and plans are provisioned and expired automatically.",
      },
      {
        q: "Can I integrate SafeLinkHub with my existing network?",
        a: "Yes. SafeLinkHub is hardware-independent and supports MikroTik, Ruijie, TP-Link, Ubiquiti UniFi, Cambium, Cisco, D-Link and Huawei.",
      },
      {
        q: "What is included in the free plan?",
        a: "The free plan includes basic hotspot billing, voucher generation and basic router monitoring, so you can try SafeLinkHub before moving to a paid plan.",
      },
      {
        q: "What is Safecoin?",
        a: "Safecoin (SC) is SafeLinkHub's internal credit: 1 SC is currently worth 100 FCFA. You top up your balance once, then use it to activate VPN access and Auto-Setup. Free quotas and promotions do not draw down Safecoin.",
      },
      {
        q: "How does network monitoring work?",
        a: "SafeLinkHub continuously polls your routers for uptime, active users, CPU load and memory usage, and displays everything in real time.",
      },
      {
        q: "Is my network data secure?",
        a: "All remote access runs through an encrypted management tunnel, and your data is isolated per organisation.",
      },
    ],
  },
  pricing: {
    periods: { monthly: "1 month", quarterly: "3 months", semiannual: "6 months", yearly: "12 months" },
    services: {
      mikhmon: "MikHmon (vouchers)",
      webfig: "WebFig (browser)",
      winbox: "WinBox",
      ssh: "SSH / SFTP",
    },
    aria: "Pricing",
    eyebrow: "Pricing",
    title: "Clear pricing, no surprises.",
    marker: "Clear",
    lead: "Real figures, pulled from the billing configuration — no asterisks, no hidden \u201cstarting from\u201d.",
    remote: {
      title: "Secure remote access",
      sub: "Encrypted tunnel to your MikroTik, per service and per duration.",
      note: (rate) => `Same price for every service. Conversion shown at the rate 1 SC = ${rate} FCFA.`,
    },
    autoSetup: {
      title: "Auto-setup installation",
      sub: "Complete router configuration in one click.",
      containerLabel: "Hotspot router + MikHmon",
      containerSub: "Container-capable boards",
      hotspotLabel: "Hotspot only",
      hotspotSub: "Lighter hardware (RB951…)",
      note: "One-off fee · binding and tunnel free.",
    },
    trial: {
      eyebrow: "Free to get started",
      headline: (days) => `${days} days of remote access free`,
      perks: [
        "WinBox, WebFig, SSH/SFTP & MikHmon included",
        "Unlimited WiFi vouchers",
        "No card required",
      ],
      cta: "Start for free",
    },
  },
  safecoin: {
    aria: "Safecoin",
    eyebrow: "Safecoin",
    title: "Your network runs on Safecoin.",
    marker: "Safecoin",
    lead: "A single prepaid credit: top up once, then switch on remote access and auto-setup without going through another payment.",
    card: {
      badge: "SFC / operator credit",
      tagline: "The internal currency of your network.",
      rateLabel: "Reference rate",
      rateNote: "A prepaid balance that stays readable and under control, so you can switch services on without juggling several payments.",
    },
    flow: {
      eyebrow: "The circuit in three moves",
      title: "Top up once. Keep a hand on every spend.",
      steps: [
        { number: "01", title: "Top-up", text: "Add FCFA through your payment gateway." },
        { number: "02", title: "Credit", text: "Your account automatically receives its SC." },
        { number: "03", title: "Activation", text: "VPN and Auto-Setup debit the right amount." },
      ],
      perks: [
        "A record of every movement",
        "Fees visible before activation",
        "Free allowances never debited",
      ],
    },
    usage: {
      title: "Consumption benchmarks",
      sub: "Remote access · per service and per period",
      badge: "current base",
      note: "Base price per service. The Safecoin fees set by your administrator are shown before every debit.",
    },
    setup: {
      eyebrow: "Auto-Setup",
      title: "A clear budget for every installation.",
      hotspotOnly: "Hotspot only",
      withContainer: "With container",
      cta: "Open my Safecoin account",
    },
    disclaimer: "Safecoin is an internal SafeLinkHub credit, not a cryptocurrency. The rate and the fees are steered from the control station; free allowances, referrals and rewards stay free.",
  },
  testimonials: {
    aria: "Testimonials",
    eyebrow: "Testimonials",
    title: "What our users say.",
    marker: "users",
    lead: "Real reviews, submitted from this page and published after approval.",
    ratingLabel: (n) => `${n} out of 5`,
    fallbackRole: "SafeLinkHub user",
    empty: {
      title: "Be the first to share your experience.",
      text: "Do you use SafeLinkHub? Tell us — your testimonial will appear here after approval.",
    },
    form: {
      title: "Share your testimonial",
      lead: "Do you use SafeLinkHub? Tell us what you think of it.",
      name: "Name *",
      role: "Role",
      rolePlaceholder: "ISP operator, hotspot manager…",
      company: "Company",
      rating: "Rating",
      starLabels: ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"],
      quote: "Your testimonial *",
      submit: "Send my testimonial",
      sending: "Sending…",
      thanksTitle: "Thank you!",
      thanksText: "Your testimonial has been sent. It will appear here after approval.",
    },
  },
  blogTeaser: {
    aria: "Latest articles",
    eyebrow: "The blog",
    title: "What our operators learn in the field.",
    marker: "in the field",
    all: "All articles",
  },
  blog: {
    journal: "SafeLinkHub journal",
    title: "The",
    titleMark: "tech blog",
    lead: "MikroTik guides, mobile money, ISP automation and product stories — to run and monetize your Wi-Fi network.",
    searchPlaceholder: "search for an article or topic…",
    searchLabel: "Search the blog",
    clearSearch: "Clear search",
    articleOne: "article",
    articleMany: "articles",
    topicOne: "topic",
    topicMany: "topics",
    topics: "Topics",
    allTopics: "All",
    noMatches: "No articles match this filter.",
    noPosts: "No articles yet.",
    tryAgain: "Try another topic or clear your search.",
    checkBack: "Check back soon — the first articles are on their way.",
    advertising: "Advertisement",
    readArticle: "Read article",
    allArticles: "All articles",
  },
  contact: {
    eyebrow: "Company",
    title: "Contact us",
    lead: "A product question, partnership or large-scale deployment? Write to us and we will get back to you quickly.",
    customerTitle: "Already a customer?",
    customerText: "For any question about your account or routers, use the Support section in your dashboard: your request will be linked to your organization.",
    openSupport: "Open support",
    responseTitle: "Response time",
    responseText: "We process messages from Monday to Saturday. You can usually expect an initial response in under 24 business hours.",
    form: {
      success: "Message sent — thank you. We will get back to you shortly.",
      name: "Name",
      namePlaceholder: "Your name",
      email: "Email",
      emailPlaceholder: "you@example.com",
      subject: "Subject",
      optional: "optional",
      subjectPlaceholder: "For example: multi-site deployment",
      message: "Message",
      messagePlaceholder: "Tell us what you need…",
      sending: "Sending…",
      submit: "Send message",
    },
    map: {
      findUs: "Find us",
      directions: "Directions",
      title: "Map",
      show: "Show map",
      privacy: "The map loads from Google. Nothing is sent until you open it.",
    },
  },
  boutique: {
    title: "Site under construction",
    lead: "Our equipment shop (MikroTik routers, antennas, PoE switches and accessories) is coming soon with its own dedicated space. Please check back soon.",
    backHome: "Back to home",
    countdown: "Back to home in",
    secondOne: "second",
    secondMany: "seconds",
    redirecting: "Redirecting…",
    footer: "SafeLinkHub · Shop",
  },
  servicesPage: {
    eyebrow: "Services",
    heading: "Everything SafeLinkHub runs on your behalf.",
    lead: "Router provisioning, captive portal, mobile money collection, fleet monitoring and supported hardware: every building block, laid out in one place.",
    metaTitle: "Services | SafeLinkHub",
    metaDescription: "MikroTik provisioning, captive portal, mobile money, monitoring: the detail of SafeLinkHub services.",
  },
  vpnPage: {
    eyebrow: "Remote access",
    heading: "Your MikroTiks, reachable from anywhere.",
    lead: "An encrypted tunnel to every router: WinBox, WebFig, SSH and MikHmon, with no public IP and even behind a CGNAT. The prices below come straight from the billing configuration, no asterisks.",
    metaTitle: "VPN and remote access | SafeLinkHub",
    metaDescription: "Encrypted tunnel to your MikroTiks: WinBox, WebFig, SSH and MikHmon, even behind a CGNAT. Real prices.",
  },
  trainingPage: {
    eyebrow: "Training",
    heading: "Learn to run a network that pays.",
    lead: "Step-by-step paths to install, secure and monetise a MikroTik hotspot — plus the field articles to go deeper.",
    heroCta: "Browse the guides",
    heroSecondary: "See the services",
    benefitsTitle: "Why these guides",
    benefits: [
      {
        title: "Written from the field",
        text: "Every guide comes from a real deployment: the settings that worked, and the ones that failed.",
      },
      {
        title: "Concrete MikroTik",
        text: "RouterOS commands to copy, not theory. You follow, you apply.",
      },
      {
        title: "Readable on a phone",
        text: "As much field as desk: the guides read standing up, next to the rack.",
      },
      {
        title: "Free to read",
        text: "No account, no payment. The content is open, and will stay open.",
      },
    ],
    aboutEyebrow: "Who writes",
    aboutTitle: "Guides written by the people running the network.",
    aboutText: "SafeLinkHub is not a school: it is the platform running MikroTik hotspots in Côte d'Ivoire and beyond. The guides come out of those deployments — configurations running in production, not exercises.",
    aboutPoints: [
      {
        title: "Checked on real hardware",
        text: "hAP ax, RB4011, RB5009, Chateau Pro: the settings published here were applied to those boards.",
      },
      {
        title: "Corrected when the field disagrees",
        text: "A guide that ages badly gets rewritten. RouterOS moves, and so do the mobile money operators.",
      },
    ],
    aboutCta: "Discover the platform",
    categoriesTitle: "Explore by topic",
    categoriesLead: "The subjects covered today, and how many guides each one has.",
    categoryCount: (n) => `${n} guide${n > 1 ? "s" : ""}`,
    ctaTitle: "Ready to set up your first hotspot?",
    ctaText: "Create your account: thirty days of remote access are on us, no card required.",
    ctaButton: "Start for free",
    coursesTitle: "Paths",
    coursesEmpty: "The first paths are on their way. In the meantime, the articles below cover the essentials.",
    lessonsCount: (n) => `${n} lesson${n > 1 ? "s" : ""}`,
    articlesTitle: "Articles and guides",
    articlesLead: "Published as the field teaches us, free to read.",
    allArticles: "All articles",
    startCourse: "Start the path",
    readArticle: "Read the full article",
    backToTraining: "← All training",
    metaTitle: "Training | SafeLinkHub",
    metaDescription: "Paths and guides to install, secure and monetise a MikroTik Wi-Fi hotspot.",
  },
  searchPage: {
    eyebrow: "Search",
    heading: "Search SafeLinkHub",
    placeholder: "A router, a setting, a question…",
    submit: "Search",
    resultsFor: (n, q) => `${n} result${n > 1 ? "s" : ""} for “${q}”`,
    empty: (q) => `Nothing matches “${q}”.`,
    hint: "Try a shorter word, or browse the training and services pages.",
    prompt: "Type what you are after: a page, a guide, a path.",
    kinds: { page: "Page", article: "Article", course: "Training" },
    metaTitle: "Search | SafeLinkHub",
    metaDescription: "Search for a page, a guide or a training path on SafeLinkHub.",
  },
  servicePages: {
    hotspot: {
      eyebrow: "Service",
      heading: "Wi-Fi hotspot",
      lead: "The captive portal, the tickets and the collection, on your own MikroTiks.",
      points: [
        {
          title: "A captive portal in your colours",
          text: "Your branding, your plans. The customer connects, chooses, pays and leaves connected without an agent stepping in.",
        },
        {
          title: "Tickets and named accounts",
          text: "Batch generation, printing, resale through your agents, and lasting accounts for regular subscribers.",
        },
        {
          title: "Mobile money collection",
          text: "Orange Money, MTN MoMo, Wave and Moov Money. Payment creates the ticket and texts it over, hands-free.",
        },
        {
          title: "Fleet monitoring",
          text: "Routers online, live sessions, today's sales: the real state of every zone in one place.",
        },
      ],
      cta: "Open an account",
    },
    camera: {
      eyebrow: "Service",
      heading: "Security cameras",
      lead: "Wiring video surveillance into the network you already run.",
      soon: "This offer is being prepared. The network, the tunnels and the monitoring already exist; the video side is still to be built. If you have a site to equip, describe what you need — it will shape what we build first.",
      cta: "Describe my need",
    },
    firewall: {
      eyebrow: "Service",
      heading: "FireWall",
      lead: "Filtering, segmentation and network protection.",
      soon: "This offer is being prepared. Your MikroTiks already enforce firewall rules laid down by auto-setup; a managed security offer, with bespoke rules and follow-up, is still to be built. Tell us what you need to protect.",
      cta: "Describe my need",
    },
  },
  backToTop: "Back to top",
};
