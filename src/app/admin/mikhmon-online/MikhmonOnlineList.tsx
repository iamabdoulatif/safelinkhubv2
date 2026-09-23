"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Box,
  CloudCog,
  ExternalLink,
  HelpCircle,
  Loader2,
  Search,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { getMikhmonLink } from "@/lib/mikrotik/mikhmon-online";
import MikhmonCloudActivationDialog from "./MikhmonCloudActivationDialog";
import { MIKHMON_EDITIONS } from "@/lib/mikrotik/mikhmon-editions";
import { normalizeCustomSlug } from "@/lib/mikrotik/mikhmon-cloud-domain";
import {
  activerMikhmonCloud,
  desactiverMikhmonCloud,
  renommerMikhmonCloud,
  supprimerMikhmonCloud,
} from "@/lib/mikrotik/mikhmon-cloud-actions";
import { buttonClass } from "@/components/ui/Button";

export type MikhmonRouter = {
  id: string;
  name: string;
  status: string;
  model: string | null;
  connectionMethod?: string;
  tunnelIp?: string | null;
  /** Où vit MikHmon pour ce routeur — voir le commentaire de page.tsx. */
  kind: "cloud" | "container" | "unknown";
  cloudDomain: string | null;
  /** active | stopped | failed — null quand aucune instance n'existe. */
  cloudStatus: string | null;
  cloudEdition: string | null;
  tunnelLink: string | null;
};

type LinkResult =
  | { error: string }
  | { success: true; ready: false; message: string; localLink?: string | null; tunnelLink?: string | null }
  | {
      success: true;
      ready: true;
      reachable: boolean;
      link: string;
      localLink?: string | null;
      tunnelLink?: string | null;
      message?: string;
    }
  | null;

type Famille = "all" | "container" | "cloud" | "unknown";

/* ── Petites pièces ─────────────────────────────────────────────────────── */

/** État du routeur : point + mot, jamais la couleur seule. */
function Etat({ status }: { status: string }) {
  const online = status === "online";
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${
        online ? "bg-ok-soft text-ok" : "bg-err-soft text-err"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${online ? "bg-ok" : "bg-err"}`} />
      {online ? "En ligne" : "Hors ligne"}
    </span>
  );
}

/** Adresse cliquable, lisible en entier (on la dicte parfois au téléphone). */
function Adresse({ href, label }: { href: string; label: string }) {
  return (
    <span className="block min-w-0">
      <span className="block text-xs text-ink-soft">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1.5 break-all font-mono text-[13px] font-medium text-brand-deep hover:underline"
      >
        {href}
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      </a>
    </span>
  );
}

function Ouvrir({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" })}>
      Ouvrir MikHmon
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </a>
  );
}

/** Une ligne : routeur et état | accès | action ; le détail se déplie dessous. */
function Ligne({
  router,
  acces,
  action,
  children,
}: {
  router: MikhmonRouter;
  acces: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="grid gap-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center md:gap-5">
        <div className="flex min-w-0 items-start justify-between gap-2 md:block">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{router.name}</p>
            {router.model && <p className="truncate font-mono text-xs text-ink-soft">{router.model}</p>}
          </div>
          <span className="shrink-0 md:mt-1.5 md:inline-block">
            <Etat status={router.status} />
          </span>
        </div>
        <div className="min-w-0">{acces}</div>
        {action && <div className="flex flex-wrap items-center gap-2 md:justify-end">{action}</div>}
      </div>
      {children}
    </li>
  );
}

/* ── Gestion d'une instance hébergée ───────────────────────────────────── */

/**
 * Les quatre gestes sur une instance en place : renommer, désactiver,
 * réactiver, supprimer. Les deux destructeurs demandent une CONFIRMATION
 * FRAPPÉE : supprimer détruit le conteneur et libère l'adresse ; renommer
 * détruit puis recrée, donc coupe le tableau une minute.
 */
function GestionInstance({ router, baseDomain }: { router: MikhmonRouter; baseDomain?: string }) {
  const [nouveauSlug, setNouveauSlug] = useState(() => router.cloudDomain?.split(".")[0] ?? "");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const actif = router.cloudStatus === "active";
  const slugActuel = router.cloudDomain?.split(".")[0] ?? "";
  const verdict = normalizeCustomSlug(nouveauSlug);
  const slugChange = verdict.ok && verdict.slug !== slugActuel;

  function lancer(action: () => Promise<{ error?: string; success?: true }>, succes: string) {
    setErreur(null);
    setMessage(null);
    startTransition(async () => {
      const r = await action();
      if (r?.error) setErreur(r.error);
      else {
        setMessage(succes);
        window.location.reload();
      }
    });
  }

  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-line bg-clay/50 p-4 md:grid-cols-2">
      <div>
        <label htmlFor={`slug-${router.id}`} className="text-[13px] font-medium text-ink">
          Adresse du tableau
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            id={`slug-${router.id}`}
            value={nouveauSlug}
            onChange={(e) => setNouveauSlug(e.target.value)}
            className="field h-9 w-48 font-mono text-[13px] sm:h-9"
          />
          <span className="font-mono text-xs text-ink-soft">.{baseDomain ?? "…"}</span>
          <button
            type="button"
            disabled={!slugChange || pending}
            onClick={() => lancer(() => renommerMikhmonCloud(router.id, nouveauSlug), "Adresse changée.")}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            Enregistrer
          </button>
        </div>
        {!verdict.ok && nouveauSlug.length > 0 && <p className="mt-1 text-xs text-err">{verdict.erreur}</p>}
        {slugChange && (
          <p className="mt-1 text-xs text-ink-soft">
            Le tableau sera recréé : l&apos;ancienne adresse cesse de répondre immédiatement, la
            nouvelle en une minute environ.
          </p>
        )}
        <div className="mt-3">
          {actif ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => lancer(() => desactiverMikhmonCloud(router.id), "Tableau désactivé.")}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              Désactiver
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => lancer(() => activerMikhmonCloud(router.id), "Tableau réactivé.")}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Réactiver
            </button>
          )}
        </div>
      </div>

      <div className="md:border-l md:border-line md:pl-4">
        <p className="text-[13px] font-medium text-ink">Supprimer le tableau</p>
        <p className="mt-1 text-xs text-ink-soft">
          Détruit le tableau et libère l&apos;adresse. Vos tickets ne sont pas touchés : ils vivent
          sur le routeur. Tapez <span className="font-mono font-semibold text-ink">{slugActuel}</span>{" "}
          pour confirmer.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            aria-label="Confirmation de suppression"
            className="field h-9 w-48 font-mono text-[13px] sm:h-9"
          />
          <button
            type="button"
            disabled={confirmation !== slugActuel || pending}
            onClick={() => lancer(() => supprimerMikhmonCloud(router.id), "Tableau supprimé.")}
            className={buttonClass({ variant: "destructive", size: "sm" })}
          >
            Supprimer
          </button>
        </div>
      </div>

      {(erreur || message) && (
        <p className={`text-xs md:col-span-2 ${erreur ? "text-err" : "text-ok"}`} role="status">
          {erreur ?? message}
        </p>
      )}
    </div>
  );
}

/* ── Lignes par famille ─────────────────────────────────────────────────── */

/** Routeur sans conteneur : son MikHmon vit sur le relais, sous son domaine. */
function LigneCloud({
  router,
  superadmin,
  baseDomain,
}: {
  router: MikhmonRouter;
  superadmin: boolean;
  baseDomain?: string;
}) {
  const [activationOpen, setActivationOpen] = useState(false);
  const [gestion, setGestion] = useState(false);
  const actif = router.cloudStatus === "active";

  return (
    <>
      <Ligne
        router={router}
        acces={
          router.cloudDomain ? (
            actif ? (
              <Adresse href={`https://${router.cloudDomain}`} label="Domaine dédié (HTTPS, sans port)" />
            ) : (
              /* Instance arrêtée : l'adresse SANS lien — un lien vers une 404
                 ferait croire à une panne alors que c'est un choix. */
              <span className="block">
                <span className="block text-xs text-ink-soft">Domaine dédié (désactivé)</span>
                <span className="block break-all font-mono text-[13px] text-ink-soft line-through">
                  {router.cloudDomain}
                </span>
              </span>
            )
          ) : (
            <span className="text-[13px] text-ink-soft">
              Aucune instance dédiée pour l’instant : MikHmon sera hébergé sur le relais, avec son
              propre sous-domaine HTTPS.
            </span>
          )
        }
        action={
          router.cloudDomain ? (
            <>
              {actif && <Ouvrir href={`https://${router.cloudDomain}`} />}
              <button
                type="button"
                onClick={() => setGestion((v) => !v)}
                aria-expanded={gestion}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
                Gérer
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setActivationOpen(true)}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Activer depuis MikHmon Online
            </button>
          )
        }
      >
        {actif && router.status !== "online" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            L’instance est en place, mais le routeur est hors ligne : reconnectez son tunnel avant
            de gérer les tickets.
          </p>
        )}
        {gestion && router.cloudDomain && <GestionInstance router={router} baseDomain={baseDomain} />}
      </Ligne>

      <MikhmonCloudActivationDialog
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
        router={router}
        superadmin={superadmin}
        baseDomain={baseDomain}
      />
    </>
  );
}

/** Routeur compatible conteneur : MikHmon tourne sur l'équipement lui-même. */
function LigneConteneur({ router }: { router: MikhmonRouter }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LinkResult>(null);
  const online = router.status === "online";

  async function tester() {
    setPending(true);
    setResult((await getMikhmonLink(router.id)) as LinkResult);
    setPending(false);
  }

  return (
    <Ligne
      router={router}
      acces={
        /* Le lien tunnel vient de la base : il s'affiche sans rien demander. */
        router.tunnelLink ? (
          <Adresse href={router.tunnelLink} label="Via le tunnel VPN — fonctionne même derrière un CGNAT" />
        ) : (
          <span className="text-[13px] text-ink-soft">
            Pas encore de lien par tunnel.{" "}
            {online ? "Testez l’accès direct." : "Le routeur doit être en ligne pour sonder son accès direct."}
          </span>
        )
      }
      action={
        <>
          {router.tunnelLink && <Ouvrir href={router.tunnelLink} />}
          <button
            type="button"
            onClick={tester}
            disabled={pending || !online}
            title={online ? undefined : "Le routeur doit être en ligne"}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            {pending && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
            {pending ? "Test en cours…" : "Tester l’accès direct"}
          </button>
        </>
      }
    >
      {result && "error" in result && <p className="mt-3 text-xs text-err">{result.error}</p>}
      {result && "success" in result && (
        <div className="mt-3 grid gap-3 rounded-xl border border-line bg-clay/50 p-4 md:grid-cols-2">
          {result.ready && <Adresse href={result.link} label="Accès direct (DDNS du routeur, port 8088)" />}
          {result.localLink && <Adresse href={result.localLink} label="Réseau local du hotspot" />}
          {result.message && (
            <p className="flex items-start gap-2 text-xs text-warn md:col-span-2">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {result.message}
            </p>
          )}
        </div>
      )}
    </Ligne>
  );
}

function LigneInconnue({ router }: { router: MikhmonRouter }) {
  return (
    <Ligne
      router={router}
      acces={
        router.tunnelLink ? (
          <Adresse href={router.tunnelLink} label="Via le tunnel VPN (accès déjà actif)" />
        ) : (
          <span className="text-[13px] text-ink-soft">
            Relancez l’auto-setup de ce routeur pour qu’il rejoigne l’une des deux familles.
          </span>
        )
      }
      action={
        <>
          {router.tunnelLink && <Ouvrir href={router.tunnelLink} />}
          <Link href="/admin/settings/router-setup" className={buttonClass({ variant: "ghost", size: "sm" })}>
            Relancer l’auto-setup
          </Link>
        </>
      }
    />
  );
}

/* ── Famille ────────────────────────────────────────────────────────────── */

function Famille({
  icon: Icon,
  titre,
  resume,
  detail,
  compte,
  children,
}: {
  icon: typeof Box;
  titre: string;
  /** Une phrase, visible. */
  resume: string;
  /** L'explication technique complète, repliée. */
  detail: string;
  compte: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-paper">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-clay/60 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Icon aria-hidden="true" className="h-4 w-4 text-brand-deep" />
            {titre}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-soft">{resume}</p>
          <details className="mt-1 text-xs text-ink-soft">
            <summary className="cursor-pointer font-medium text-brand-deep">Comment ça marche</summary>
            <p className="mt-1 max-w-3xl leading-5">{detail}</p>
          </details>
        </div>
        <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold tabular-nums text-ink-soft">
          {compte} routeur{compte > 1 ? "s" : ""}
        </span>
      </div>
      <ul className="divide-y divide-line-soft" role="list">
        {children}
      </ul>
    </section>
  );
}

/* ── Écran ──────────────────────────────────────────────────────────────── */

export default function MikhmonOnlineConsole({
  routers,
  superadmin = false,
  baseDomain,
}: {
  routers: MikhmonRouter[];
  superadmin?: boolean;
  baseDomain?: string;
}) {
  const [query, setQuery] = useState("");
  const [famille, setFamille] = useState<Famille>("all");

  if (routers.length === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">MikHmon Online</h1>
        <div className="mt-6 rounded-xl border border-dashed border-line-strong/50 bg-paper px-4 py-10 text-center">
          <p className="text-sm font-semibold text-ink">Aucun routeur lié pour le moment</p>
          <p className="mt-1 text-[13px] text-ink-soft">Ajoutez-en un pour ouvrir son tableau MikHmon ici.</p>
          <Link href="/admin/settings/router-setup?new=1" className={buttonClass({ variant: "primary", className: "mt-5" })}>
            Lier un MikroTik
          </Link>
        </div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const visible = (r: MikhmonRouter) =>
    (!q || `${r.name} ${r.model ?? ""} ${r.cloudDomain ?? ""}`.toLowerCase().includes(q));
  const cloud = routers.filter((r) => r.kind === "cloud");
  const conteneur = routers.filter((r) => r.kind === "container");
  const inconnus = routers.filter((r) => r.kind === "unknown");
  const cloudActifs = cloud.filter((r) => r.cloudStatus === "active").length;
  const montre = (f: Exclude<Famille, "all">) => famille === "all" || famille === f;

  const conteneurVus = conteneur.filter(visible);
  const cloudVus = cloud.filter(visible);
  const inconnusVus = inconnus.filter(visible);
  const rien =
    (!montre("container") || conteneurVus.length === 0) &&
    (!montre("cloud") || cloudVus.length === 0) &&
    (!montre("unknown") || inconnusVus.length === 0);

  const compteurs = [
    { label: "Parc lié", value: routers.length, tone: "text-ink" },
    { label: "Sur le routeur", value: conteneur.length, tone: "text-ink" },
    { label: "Domaines dédiés", value: cloudActifs, tone: cloudActifs > 0 ? "text-ok" : "text-ink" },
    { label: "Capacité inconnue", value: inconnus.length, tone: inconnus.length > 0 ? "text-warn" : "text-ink" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">MikHmon Online</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Ouvrez le tableau MikHmon de chaque routeur. Selon le matériel, il tourne sur le routeur
          lui-même ou sur un domaine dédié hébergé par SafeLinkHub.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {compteurs.map((c) => (
          <div key={c.label} className="bg-paper px-4 py-3">
            <dt className="text-xs text-ink-soft">{c.label}</dt>
            <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${c.tone}`}>{c.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="relative md:max-w-sm md:flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un routeur ou un domaine…"
            aria-label="Rechercher un routeur ou un domaine"
            className="field pl-9"
          />
        </div>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div role="group" aria-label="Filtrer par emplacement de MikHmon" className="inline-flex gap-1 rounded-full bg-line-soft p-1">
            {(
              [
                ["all", "Tous", routers.length],
                ["container", "Sur le routeur", conteneur.length],
                ["cloud", "Domaine dédié", cloud.length],
                ["unknown", "À déterminer", inconnus.length],
              ] as const
            )
              .filter(([key, , n]) => key === "all" || n > 0)
              .map(([key, label, n]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={famille === key}
                  onClick={() => setFamille(key)}
                  className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors ${
                    famille === key
                      ? "border-line bg-paper font-semibold text-ink"
                      : "border-transparent font-medium text-ink-soft hover:text-ink"
                  }`}
                >
                  {label}
                  <span className="tabular-nums text-ink-soft">{n}</span>
                </button>
              ))}
          </div>
        </div>
      </div>

      {rien && (
        <div className="rounded-xl border border-dashed border-line-strong/50 bg-paper px-4 py-8 text-center">
          <p className="text-sm font-semibold text-ink">Aucun routeur ne correspond</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFamille("all");
            }}
            className={buttonClass({ variant: "outline", className: "mt-4" })}
          >
            Réinitialiser la recherche
          </button>
        </div>
      )}

      {montre("container") && conteneurVus.length > 0 && (
        <Famille
          icon={Box}
          titre="MikHmon v7 — sur le routeur"
          resume="Cartes compatibles Container : MikHmon tourne sur le routeur, ouvert par le tunnel VPN."
          detail={`${MIKHMON_EDITIONS.v7.routerOs} — ${MIKHMON_EDITIONS.v7.audience} ${MIKHMON_EDITIONS.v7.origine} Le lien par tunnel s’affiche dès qu’il est actif ; l’accès direct exige de joindre le routeur pour lire son DDNS et sonder le port, d’où le bouton « Tester l’accès direct ».`}
          compte={conteneur.length}
        >
          {conteneurVus.map((r) => (
            <LigneConteneur key={r.id} router={r} />
          ))}
        </Famille>
      )}

      {montre("cloud") && cloudVus.length > 0 && (
        <Famille
          icon={CloudCog}
          titre="MikHmon v6 — sans conteneur, domaine dédié"
          resume="Cartes sans Container (RB951, hEX, wAP…) : MikHmon hébergé par SafeLinkHub, sur son propre sous-domaine HTTPS."
          detail={`${MIKHMON_EDITIONS.v6.routerOs} — ${MIKHMON_EDITIONS.v6.audience} ${MIKHMON_EDITIONS.v6.origine} Il est hébergé sur le relais et répond sur son propre sous-domaine HTTPS ; le routeur ne reçoit ni conteneur, ni bridge, ni règle NAT.`}
          compte={cloud.length}
        >
          {cloudVus.map((r) => (
            <LigneCloud key={r.id} router={r} superadmin={superadmin} baseDomain={baseDomain} />
          ))}
        </Famille>
      )}

      {montre("unknown") && inconnusVus.length > 0 && (
        <Famille
          icon={HelpCircle}
          titre="Capacité pas encore déterminée"
          resume="SafeLinkHub ne sait pas encore si ces cartes acceptent Container."
          detail="L’information n’est enregistrée qu’à l’issue d’un auto-setup réussi. Tant qu’elle manque, aucune instance dédiée ne peut être créée pour ces routeurs. Relancez la configuration automatique depuis Paramètres → Configuration routeur."
          compte={inconnus.length}
        >
          {inconnusVus.map((r) => (
            <LigneInconnue key={r.id} router={r} />
          ))}
        </Famille>
      )}
    </div>
  );
}

