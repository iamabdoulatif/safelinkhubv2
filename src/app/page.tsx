import Link from "next/link";
import BackToTop from "@/components/BackToTop";
import SplashLoader from "@/components/SplashLoader";
import {
  CreditCard,
  Monitor,
  Plug,
  Cloud,
  Users,
  BarChart3,
  Receipt,
  Wifi,
  Server,
  UserCheck,
  Ticket,
  Router,
  Globe,
  ChevronDown,
  Quote,
  TrendingUp,
} from "lucide-react";

// Brand name must never be machine-translated
function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span
      translate="no"
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
    icon: CreditCard,
  },
  {
    title: "Surveillance réseau en temps réel",
    description:
      "Suivez le temps de fonctionnement, les utilisateurs actifs, la charge CPU et mémoire de chaque routeur, instantanément.",
    icon: Monitor,
  },
  {
    title: "Intégration en un clic",
    description:
      "Connectez n'importe quel routeur MikroTik RouterOS avec un seul script d'installation.",
    icon: Plug,
  },
  {
    title: "Gestion depuis le cloud",
    description: "Gérez tous vos sites et routeurs depuis un seul tableau de bord central.",
    icon: Cloud,
  },
  {
    title: "Gestion automatisée des utilisateurs",
    description:
      "Provisionnez, expirez et facturez automatiquement les utilisateurs hotspot et PPPoE.",
    icon: Users,
  },
  {
    title: "Solutions FAI évolutives",
    description: "Passez d'un simple hotspot à un FAI multi-sites sans changer d'outils.",
    icon: BarChart3,
  },
];

const platformFeatures = [
  {
    title: "Facturation automatisée complète",
    description:
      "Du Mobile Money (MTN, Airtel) aux paiements par carte et virements bancaires, automatisez tout votre cycle de revenus.",
    icon: Receipt,
  },
  {
    title: "Gestion avancée PPPoE et Hotspot",
    description:
      "Gérez facilement les utilisateurs PPPoE avec des quotas de données, des limites de débit et des profils personnalisés.",
    icon: Wifi,
  },
  {
    title: "Noyau RADIUS puissant",
    description:
      "Notre puissant serveur RADIUS cloud s'intègre au matériel que vous possédez déjà, indépendant du constructeur.",
    icon: Server,
  },
  {
    title: "Système Agent et Point de Vente",
    description:
      "Notre fonctionnalité Agent unique permet à votre équipe de vendre des forfaits internet en espèces.",
    icon: UserCheck,
  },
  {
    title: "Analytique et rapports détaillés",
    description:
      "Surveillez la santé du réseau en temps réel, suivez l'utilisation des données, la charge CPU et analysez la croissance de vos revenus.",
    icon: BarChart3,
  },
  {
    title: "Génération de vouchers conviviale",
    description: "Créez et imprimez des vouchers WiFi personnalisés en quelques secondes.",
    icon: Ticket,
  },
];

const hardware = [
  {
    name: "MikroTik",
    description:
      "Intégration RouterOS approfondie : scripts d'installation automatiques, créateur de topologie visuelle, et synchronisation des profils hotspot/PPPoE.",
    icon: Router,
  },
  {
    name: "Ruijie Reyee",
    description:
      "Points d'accès et switches Reyee gérés depuis le cloud, facturés et surveillés depuis SafeLinkHub.",
    icon: Wifi,
  },
  {
    name: "TP-Link",
    description:
      "Gérez votre matériel TP-Link Omada au même endroit que le reste de votre réseau.",
    icon: Monitor,
  },
  {
    name: "Ubiquiti UniFi",
    description:
      "Intégrez les clients et sites de votre contrôleur UniFi à la facturation et l'analytique SafeLinkHub.",
    icon: Globe,
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

const mockStats = [
  { label: "Ventes nettes", value: "428 500 FCFA", trend: "+12 %" },
  { label: "Ventes de vouchers", value: "186 000 FCFA", trend: "+8 %" },
  { label: "Clients actifs", value: "847", trend: "+23" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo dark />
          <nav aria-label="Navigation principale" className="hidden items-center gap-8 text-sm font-medium text-slate-300 sm:flex">
            <a
              href="#features"
              className="rounded hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Fonctionnalités
            </a>
            <a
              href="#solutions"
              className="rounded hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Solutions
            </a>
            <a
              href="/blog"
              className="rounded hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Blog
            </a>
          </nav>
          <Link
            href="/auth/login"
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Commencer
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="bg-slate-950">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-24">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
              Le n°1 de la facturation Hotspot &amp; plateforme d&apos;automatisation FAI
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              SafeLinkHub est la plateforme d&apos;automatisation Hotspot et FAI la plus
              avancée, conçue pour gérer, automatiser et développer n&apos;importe quel réseau.
            </p>
            <Link
              href="/auth/login"
              className="mt-8 rounded-full bg-emerald-500 px-8 py-3 text-base font-semibold text-slate-950 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Démarrer gratuitement
            </Link>

            {/* Dashboard preview */}
            <div className="mt-16 w-full overflow-hidden rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-4 py-3">
                <span aria-hidden="true" className="h-3 w-3 rounded-full bg-red-500/70" />
                <span aria-hidden="true" className="h-3 w-3 rounded-full bg-yellow-500/70" />
                <span aria-hidden="true" className="h-3 w-3 rounded-full bg-emerald-500/70" />
                <span className="ml-3 truncate rounded-sm bg-slate-800 px-3 py-0.5 text-xs text-slate-400">
                  app.safelinkhub.net/admin
                </span>
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-1 gap-px bg-slate-800 sm:grid-cols-3">
                {mockStats.map((s) => (
                  <div key={s.label} className="bg-slate-900 p-4 text-left">
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className="mt-1.5 text-xl font-semibold tabular-nums text-white">
                      {s.value}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-400">
                      <TrendingUp aria-hidden="true" className="h-3 w-3" />
                      {s.trend} ce mois
                    </p>
                  </div>
                ))}
              </div>
              {/* Mini router status bar */}
              <div className="flex items-center gap-3 border-t border-slate-800 bg-slate-950 px-4 py-2">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  12 routeurs en ligne
                </span>
                <span aria-hidden="true" className="h-3 w-px bg-slate-700" />
                <span className="text-xs text-slate-500">847 connexions actives</span>
              </div>
            </div>

            {/* Vendor compatibility strip */}
            <div className="mt-14 w-full border-t border-slate-800 pt-10">
              <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Compatible avec
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {vendors.map((v) => (
                  <span
                    key={v}
                    translate="no"
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-400"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Value proposition ──────────────────────────────────────────── */}
        <section className="bg-white py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              Arrêtez de jongler entre systèmes. Faites grandir votre réseau.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-center text-base leading-7 text-slate-500">
              Gérer un FAI ou un hotspot présente des défis uniques. SafeLinkHub remplace
              votre configuration multi-systèmes par une seule plateforme puissante et
              automatisée.
            </p>
            <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3" role="list">
              {[
                { pain: "Création manuelle des utilisateurs PPPoE et des vouchers", fix: "Provisionnement automatique" },
                { pain: "Suivi des paiements sur tableurs et outils éparpillés", fix: "Facturation centralisée" },
                { pain: "Pertes de revenus faute de visibilité en temps réel", fix: "Tableau de bord unifié" },
              ].map((item) => (
                <li
                  key={item.fix}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    {item.fix}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.pain}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Quick features ─────────────────────────────────────────────── */}
        <section id="features" className="bg-slate-50 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              Tout ce dont vous avez besoin pour gérer une activité hotspot
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {quickFeatures.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="hover-lift rounded-xl border border-slate-200 bg-white p-6 animate-fade-in-up"
                    style={{ animationDelay: `${(i % 3) * 80}ms` }}
                  >
                    <div
                      aria-hidden="true"
                      className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-900">{f.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{f.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Hardware compatibility ──────────────────────────────────────── */}
        <section id="solutions" className="bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              Une seule plateforme. Tout votre matériel.
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {hardware.map((h) => {
                const Icon = h.icon;
                return (
                  <div
                    key={h.name}
                    className="hover-lift rounded-xl border border-slate-200 p-6"
                  >
                    <div
                      aria-hidden="true"
                      className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-500"
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-900" translate="no">
                      {h.name}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{h.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Complete platform ──────────────────────────────────────────── */}
        <section className="bg-slate-950 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-white">
              Une plateforme complète pour un contrôle réseau total
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-px bg-slate-800 sm:grid-cols-2 lg:grid-cols-3">
              {platformFeatures.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="bg-slate-950 p-6 animate-fade-in-up hover:bg-slate-900 transition-colors"
                    style={{ animationDelay: `${(i % 3) * 80}ms` }}
                  >
                    <div
                      aria-hidden="true"
                      className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500"
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-white">{f.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{f.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Testimonials ──────────────────────────────────────────────── */}
        <section className="bg-slate-50 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              Adopté par les FAI à travers l&apos;Afrique de l&apos;Est
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {testimonials.map((t, i) => (
                <figure
                  key={t.author}
                  className="hover-lift rounded-xl border border-slate-200 bg-white p-6 animate-fade-in-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div aria-hidden="true" className="mb-4 text-emerald-500">
                    <Quote className="h-6 w-6" />
                  </div>
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

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section className="bg-white py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              Questions fréquentes
            </h2>
            <div className="mt-10 divide-y divide-slate-200">
              {faqs.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 rounded">
                    {f.q}
                    <ChevronDown
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA band ──────────────────────────────────────────────────── */}
        <section className="bg-emerald-500 py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Prêt à automatiser votre réseau ?
            </h2>
            <p className="mt-4 text-base text-emerald-50">
              Commencez gratuitement. Aucune carte bancaire requise.
            </p>
            <Link
              href="/auth/login"
              className="mt-8 inline-block rounded-full bg-slate-950 px-8 py-3 text-base font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-500"
            >
              Créer un compte gratuit
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-10 sm:flex-row">
            <div className="shrink-0">
              <Logo />
              <p className="mt-3 text-sm text-slate-500">Le réseau commence ici.</p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
              <div>
                <p className="font-semibold text-slate-900">Produit</p>
                <ul className="mt-3 space-y-2" role="list">
                  <li><a href="/" className="text-slate-500 hover:text-slate-900">Accueil</a></li>
                  <li><a href="#features" className="text-slate-500 hover:text-slate-900">Fonctionnalités</a></li>
                  <li><a href="#solutions" className="text-slate-500 hover:text-slate-900">Solutions</a></li>
                  <li><Link href="/auth/login" className="text-slate-500 hover:text-slate-900">Commencer</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Entreprise</p>
                <ul className="mt-3 space-y-2" role="list">
                  <li><a href="/contact" className="text-slate-500 hover:text-slate-900">Contact</a></li>
                  <li><a href="/" className="text-slate-500 hover:text-slate-900" translate="no">SafeLinkHub Systems</a></li>
                  <li><a href="/careers" className="text-slate-500 hover:text-slate-900">Carrières</a></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Ressources</p>
                <ul className="mt-3 space-y-2" role="list">
                  <li><a href="/blog" className="text-slate-500 hover:text-slate-900">Blog</a></li>
                  <li><a href="/legal/terms" className="text-slate-500 hover:text-slate-900">Conditions d&apos;utilisation</a></li>
                  <li><a href="/legal/privacy" className="text-slate-500 hover:text-slate-900">Politique de confidentialité</a></li>
                  <li><a href="/support" className="text-slate-500 hover:text-slate-900">Support</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-6 sm:flex-row">
            <p className="text-sm text-slate-400">
              © {new Date().getFullYear()} SafeLinkHub. Tous droits réservés.
            </p>
            <nav aria-label="Réseaux sociaux" className="flex gap-5">
              <a
                href="https://x.com/safelinkhub"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-slate-600"
              >
                Twitter / X
              </a>
              <a
                href="https://linkedin.com/company/safelinkhub"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-slate-600"
              >
                LinkedIn
              </a>
              <a
                href="https://tiktok.com/@safelinkhub"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-slate-600"
              >
                TikTok
              </a>
            </nav>
          </div>
        </div>
      </footer>

      <BackToTop />
      <SplashLoader />
    </div>
  );
}
