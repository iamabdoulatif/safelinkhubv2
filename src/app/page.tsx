import Link from "next/link";

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`text-xl font-bold tracking-tight ${
        dark ? "text-white" : "text-slate-900"
      }`}
    >
      Safe<span className="text-emerald-400">LinkHub</span>
    </span>
  );
}

const vendors = [
  "MikroTik",
  "Ruijie Reyee",
  "TP-Link",
  "Ubiquiti UniFi",
  "Cambium Networks",
  "Cisco",
  "D-Link",
  "Huawei",
];

const quickFeatures = [
  {
    title: "Facturation hotspot intelligente",
    description:
      "Vendez des forfaits à la durée ou aux données, acceptez le mobile money, et voyez vos revenus arriver sur votre tableau de bord en temps réel.",
  },
  {
    title: "Surveillance réseau en temps réel",
    description:
      "Suivez le temps de fonctionnement, les utilisateurs actifs, la charge CPU et mémoire de chaque routeur, instantanément.",
  },
  {
    title: "Intégration en un clic",
    description:
      "Connectez n'importe quel routeur MikroTik RouterOS avec un seul script d'installation.",
  },
  {
    title: "Gestion depuis le cloud",
    description: "Gérez tous vos sites et routeurs depuis un seul tableau de bord central.",
  },
  {
    title: "Gestion automatisée des utilisateurs",
    description: "Provisionnez, expirez et facturez automatiquement les utilisateurs hotspot et PPPoE.",
  },
  {
    title: "Solutions FAI évolutives",
    description: "Passez d'un simple hotspot à un FAI multi-sites sans changer d'outils.",
  },
];

const platformFeatures = [
  {
    title: "Facturation et facturation automatisées complètes",
    description:
      "Du Mobile Money (MTN, Airtel) aux paiements par carte et virements bancaires, automatisez tout votre cycle de revenus.",
  },
  {
    title: "Gestion avancée PPPoE et Hotspot",
    description:
      "Gérez facilement les utilisateurs PPPoE avec des quotas de données, des limites de débit et des profils personnalisés.",
  },
  {
    title: "Noyau RADIUS puissant (indépendant du matériel)",
    description:
      "Notre puissant serveur RADIUS cloud s'intègre au matériel que vous possédez déjà.",
  },
  {
    title: "Système Agent et Point de Vente (POS)",
    description:
      "Notre fonctionnalité Agent unique permet à votre équipe de vendre des forfaits internet en espèces.",
  },
  {
    title: "Analytique et rapports détaillés",
    description:
      "Surveillez la santé du réseau en temps réel, suivez l'utilisation des données, la charge CPU des routeurs et analysez la croissance de vos revenus.",
  },
  {
    title: "Génération de vouchers conviviale",
    description: "Créez et imprimez des vouchers WiFi personnalisés en quelques secondes.",
  },
];

const hardware = [
  {
    name: "MikroTik",
    description:
      "Intégration RouterOS approfondie : scripts d'installation automatiques, créateur de topologie visuelle, et synchronisation des profils hotspot/PPPoE.",
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
];

const testimonials = [
  {
    quote:
      "La facturation automatisée et la surveillance réseau de SafeLinkHub ont transformé la gestion de nos opérations FAI.",
    author: "Kasiita Godfrey",
    company: "Opérateur FAI",
  },
  {
    quote:
      "Avant SafeLinkHub, notre facturation était un fouillis de feuilles de calcul et de suivis manuels.",
    author: "Sanyu Nakato",
    company: "Nile Fibre",
  },
  {
    quote:
      "Nous avons commencé avec le plan gratuit juste pour tester, mais en une semaine nous sommes passés au plan Pro.",
    author: "Esther Acheng",
    company: "KiliData",
  },
];

const faqs = [
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
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1220]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo dark />
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-300 sm:flex">
            <a href="#features" className="hover:text-white">
              Fonctionnalités
            </a>
            <a href="#solutions" className="hover:text-white">
              Solutions
            </a>
            <a href="#blog" className="hover:text-white">
              Blog
            </a>
          </nav>
          <Link
            href="/auth/login"
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
          >
            Commencer
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0b1220]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, rgba(16,185,129,0.20) 0%, rgba(11,18,32,0) 70%)",
          }}
        />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pt-24 pb-16 text-center">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            Le n°1 de la facturation Hotspot &amp; plateforme d'automatisation FAI
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-300">
            SafeLinkHub est la plateforme d'automatisation Hotspot et FAI la plus
            avancée, conçue pour gérer, automatiser et développer n'importe quel réseau.
          </p>
          <Link
            href="/auth/login"
            className="mt-8 rounded-full bg-emerald-500 px-8 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Démarrer gratuitement
          </Link>

          {/* product preview */}
          <div className="mt-16 w-full rounded-t-2xl border border-white/10 bg-gradient-to-b from-emerald-500/30 to-emerald-700/10 p-2 shadow-2xl">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
                <span className="ml-3 truncate text-xs text-slate-400">
                  web.safelinkhub.net/admin
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-3">
                {["Ventes nettes", "Ventes de vouchers", "Crédit du compte"].map(
                  (label) => (
                    <div
                      key={label}
                      className="rounded-lg border border-slate-200 p-3 text-left"
                    >
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        FCFA 0
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>

          {/* vendor logos */}
          <div className="mt-14 grid w-full grid-cols-2 gap-4 border-t border-white/10 pt-10 text-sm font-medium text-slate-400 sm:grid-cols-4 lg:grid-cols-8">
            {vendors.map((v) => (
              <span key={v} className="text-center">
                {v}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stop juggling systems */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Arrêtez de jongler entre systèmes. Faites grandir votre réseau.
          </h2>
          <p className="mt-6 text-base leading-7 text-slate-500">
            Gérer un FAI ou un hotspot présente des défis uniques. La création
            manuelle d'utilisateurs PPPoE, le suivi des paiements, la gestion
            de différentes marques de routeurs et la prévention des pertes de
            revenus sont des combats constants. Vous avez besoin d'une
            solution unique qui fonctionne vraiment. SafeLinkHub est le
            logiciel de gestion FAI conçu pour résoudre exactement ces
            problèmes. Nous remplaçons votre configuration multi-systèmes
            complexe par une seule plateforme puissante et automatisée, vous
            redonnant votre temps et boostant vos profits.
          </p>
        </div>
      </section>

      {/* Quick features */}
      <section id="features" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Tout ce dont vous avez besoin pour gérer une activité hotspot
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {quickFeatures.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div className="mb-4 h-9 w-9 rounded-lg bg-emerald-500/10" />
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hardware compatibility */}
      <section id="solutions" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Une seule plateforme. Tout votre matériel.
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {hardware.map((h) => (
              <div
                key={h.name}
                className="rounded-xl border border-slate-200 p-6"
              >
                <h3 className="font-semibold text-slate-900">{h.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {h.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Complete platform */}
      <section className="bg-[#0b1220] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-white">
            Une plateforme complète pour un contrôle réseau total
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {platformFeatures.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="mb-4 h-9 w-9 rounded-lg bg-emerald-500/20" />
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Adopté par les FAI à travers l'Afrique de l'Est
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {testimonials.map((t) => (
              <figure
                key={t.author}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <blockquote className="text-sm leading-6 text-slate-600">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-sm font-semibold text-slate-900">
                  {t.author}
                  <span className="ml-1 font-normal text-slate-400">
                    · {t.company}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Questions fréquentes
          </h2>
          <div className="mt-10 divide-y divide-slate-200">
            {faqs.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-slate-900">
                  {f.q}
                  <span className="ml-4 text-slate-400 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-6 text-slate-500">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
            <div>
              <Logo />
              <p className="mt-3 text-sm font-medium text-slate-500">
                Le réseau commence ici.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-8 text-sm">
              <div>
                <p className="font-semibold text-slate-900">Produit</p>
                <ul className="mt-3 space-y-2 text-slate-500">
                  <li>Accueil</li>
                  <li>Fonctionnalités</li>
                  <li>Solutions</li>
                  <li>Commencer</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Entreprise</p>
                <ul className="mt-3 space-y-2 text-slate-500">
                  <li>Contact</li>
                  <li>SafeLinkHub Systems</li>
                  <li>Carrières</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Ressources</p>
                <ul className="mt-3 space-y-2 text-slate-500">
                  <li>Blog</li>
                  <li>Conditions d'utilisation</li>
                  <li>Politique de confidentialité</li>
                  <li>Support</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-6">
            <p className="text-sm text-slate-400">
              © {new Date().getFullYear()} SafeLinkHub. Tous droits réservés.
            </p>
            <div className="flex gap-4 text-sm text-slate-400">
              <span>Twitter / X</span>
              <span>LinkedIn</span>
              <span>TikTok</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
