"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Box,
  CloudCog,
  ExternalLink,
  Globe,
  HelpCircle,
  Loader2,
  Router as RouterIcon,
} from "lucide-react";
import { getMikhmonLink } from "@/lib/mikrotik/mikhmon-online";
import MikhmonCloudActivationDialog from "./MikhmonCloudActivationDialog";
import { MIKHMON_EDITIONS } from "@/lib/mikrotik/mikhmon-editions";

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

const panel = "border border-line bg-paper p-5 sm:p-6";

function StatusDot({ status }: { status: string }) {
  const online = status === "online";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <i className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-warn"}`} />
      <span className={online ? "text-ok" : "text-warn"}>{online ? "En ligne" : "Hors ligne"}</span>
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "ink" | "ok" | "warn";
}) {
  const couleur = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <article className="border border-line-soft p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${couleur}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-ink-soft">{hint}</p>
    </article>
  );
}

function Lien({ href, label }: { href: string; label: string }) {
  return (
    <span className="block">
      <span className="block text-[11px] text-ink-soft">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 break-all font-mono text-sm font-medium text-ok hover:underline"
      >
        {href}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    </span>
  );
}

/** Routeur sans conteneur : son MikHmon vit sur le relais, sous son domaine. */
function CarteCloud({ router, superadmin }: { router: MikhmonRouter; superadmin: boolean }) {
  const [activationOpen, setActivationOpen] = useState(false);

  return (
    <>
      <article className="border border-line-soft p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-ink">{router.name}</span>
          <StatusDot status={router.status} />
        </div>
        {router.model && <p className="mt-0.5 font-mono text-xs text-ink-soft">{router.model}</p>}

        {router.cloudDomain ? (
          <div className="mt-3">
            <Lien href={`https://${router.cloudDomain}`} label="Domaine dédié (HTTPS, sans port)" />
            {router.status !== "online" && (
              <p className="mt-2 flex items-start gap-1.5 bg-clay px-2.5 py-2 text-xs text-warn">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                L’instance est en place, mais le routeur est hors ligne : reconnectez son tunnel
                avant de gérer les tickets.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 bg-clay px-2.5 py-2.5 text-xs leading-5 text-ink-soft">
            <p>
              Aucune instance dédiée pour l’instant. MikHmon sera hébergé sur le relais et recevra son propre sous-domaine HTTPS.
            </p>
            <button
              type="button"
              onClick={() => setActivationOpen(true)}
              className="mt-2 font-semibold text-brand-deep underline-offset-2 hover:underline"
            >
              Activer depuis MikHmon Online →
            </button>
          </div>
        )}
      </article>

      <MikhmonCloudActivationDialog
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
        router={router}
        superadmin={superadmin}
      />
    </>
  );
}

/** Routeur compatible conteneur : MikHmon tourne sur l'équipement lui-même. */
function CarteConteneur({ router }: { router: MikhmonRouter }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LinkResult>(null);

  async function chercher() {
    setPending(true);
    setResult((await getMikhmonLink(router.id)) as LinkResult);
    setPending(false);
  }

  return (
    <article className="border border-line-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-ink">{router.name}</span>
          {router.model && <p className="mt-0.5 font-mono text-xs text-ink-soft">{router.model}</p>}
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={router.status} />
          <button
            type="button"
            onClick={chercher}
            disabled={pending || router.status !== "online"}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-clay disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pending ? "Recherche…" : "Vérifier l’accès"}
          </button>
        </div>
      </div>

      {/* Le lien tunnel vient de la base : il s'affiche sans rien demander. */}
      {router.tunnelLink && (
        <div className="mt-3">
          <Lien href={router.tunnelLink} label="Via le tunnel VPN — fonctionne même derrière un CGNAT" />
        </div>
      )}

      {router.status !== "online" && (
        <p className="mt-3 text-xs text-ink-soft">
          Le routeur doit être en ligne pour sonder son accès direct.
        </p>
      )}

      {result && "error" in result && <p className="mt-3 text-xs text-err">{result.error}</p>}

      {result && "success" in result && (
        <div className="mt-3 space-y-2">
          {result.ready && <Lien href={result.link} label="Accès direct (DDNS du routeur, port 8088)" />}
          {result.localLink && <Lien href={result.localLink} label="Réseau local du hotspot" />}
          {result.message && (
            <p className="flex items-start gap-1.5 bg-clay px-2.5 py-2 text-xs leading-5 text-warn">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {result.message}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function Section({
  icon: Icon,
  titre,
  chapo,
  compte,
  children,
  vide,
}: {
  icon: typeof Globe;
  titre: string;
  chapo: string;
  compte: number;
  children: React.ReactNode;
  vide: string;
}) {
  return (
    <section className={`mt-5 ${panel}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <Icon className="h-5 w-5 text-brand-deep" />
            {titre}
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{chapo}</p>
        </div>
        <span className="shrink-0 text-xs text-ink-soft">{compte} routeur(s)</span>
      </div>
      {compte === 0 ? (
        <p className="mt-4 border border-dashed border-line-soft bg-clay/40 p-4 text-sm text-ink-soft">
          {vide}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">{children}</div>
      )}
    </section>
  );
}

export default function MikhmonOnlineConsole({
  routers,
  superadmin = false,
}: {
  routers: MikhmonRouter[];
  superadmin?: boolean;
}) {
  const cloud = routers.filter((r) => r.kind === "cloud");
  const conteneur = routers.filter((r) => r.kind === "container");
  const inconnus = routers.filter((r) => r.kind === "unknown");
  const cloudActifs = cloud.filter((r) => r.cloudDomain).length;

  if (routers.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-ink">MikHmon Online</h1>
        <p className="mt-4 bg-clay px-3 py-2.5 text-sm text-ink-soft">
          Aucun routeur lié pour le moment — ajoutez-en un depuis la page Routeurs.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">MikHmon Online</h1>
      </div>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-soft">
        MikHmon ne vit pas au même endroit selon le matériel. Les cartes compatibles RouterOS
        Container l’hébergent elles-mêmes ; les autres — RB951, hEX, wAP et le reste de la famille
        MIPS — reçoivent une instance dédiée sur le relais SafeLinkHub, joignable en HTTPS sur son
        propre sous-domaine, sans qu’aucun conteneur ne soit posé sur le routeur.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Parc lié" value={routers.length} hint="Routeurs de cette organisation." />
        <Kpi
          label="Domaines dédiés"
          value={cloudActifs}
          tone={cloudActifs > 0 ? "ok" : "ink"}
          hint="Instances hébergées sur le relais et joignables."
        />
        <Kpi
          label="Sur le routeur"
          value={conteneur.length}
          hint="Cartes compatibles Container, MikHmon local."
        />
        <Kpi
          label="Capacité inconnue"
          value={inconnus.length}
          tone={inconnus.length > 0 ? "warn" : "ink"}
          hint="Ni classées ni orientées tant que l’auto-setup n’a pas tourné."
        />
      </div>

      <Section
        icon={CloudCog}
        titre="MikHmon v6 — sans conteneur, domaine dédié"
        chapo={`${MIKHMON_EDITIONS.v6.audience} ${MIKHMON_EDITIONS.v6.origine} Il est hébergé sur le relais et répond sur son propre sous-domaine HTTPS ; le routeur ne reçoit ni conteneur, ni bridge, ni règle NAT.`}
        compte={cloud.length}
        vide="Aucun routeur classé « sans conteneur » pour l’instant."
      >
        {cloud.map((r) => (
          <CarteCloud key={r.id} router={r} superadmin={superadmin} />
        ))}
      </Section>

      <Section
        icon={Box}
        titre="MikHmon v7 — sur le routeur"
        chapo={`${MIKHMON_EDITIONS.v7.origine} ${MIKHMON_EDITIONS.v7.audience} Le lien par tunnel s’affiche dès qu’il est actif ; l’accès direct exige de joindre le routeur pour lire son DDNS et sonder le port, d’où le bouton.`}
        compte={conteneur.length}
        vide="Aucun routeur compatible Container pour l’instant."
      >
        {conteneur.map((r) => (
          <CarteConteneur key={r.id} router={r} />
        ))}
      </Section>

      {inconnus.length > 0 && (
        <Section
          icon={HelpCircle}
          titre="Capacité pas encore déterminée"
          chapo="SafeLinkHub ne sait pas encore si ces cartes acceptent RouterOS Container : l’information n’est enregistrée qu’à l’issue d’un auto-setup réussi. Tant qu’elle manque, aucune instance dédiée ne peut être créée pour eux. Relancez la configuration automatique depuis Paramètres → Configuration routeur."
          compte={inconnus.length}
          vide=""
        >
          {inconnus.map((r) => (
            <article key={r.id} className="border border-line-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-ink">{r.name}</span>
                  {r.model && <p className="mt-0.5 font-mono text-xs text-ink-soft">{r.model}</p>}
                </div>
                <StatusDot status={r.status} />
              </div>
              {r.tunnelLink && (
                <div className="mt-3">
                  <Lien href={r.tunnelLink} label="Via le tunnel VPN (accès déjà actif)" />
                </div>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-ink-soft">
                <RouterIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Relancez l’auto-setup de ce routeur pour qu’il rejoigne l’une des deux familles.
              </p>
            </article>
          ))}
        </Section>
      )}
    </div>
  );
}
