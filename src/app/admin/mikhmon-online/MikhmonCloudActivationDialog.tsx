"use client";

import { useState, useTransition } from "react";
import { Check, Cloud, Loader2, Router as RouterIcon, ShieldCheck, X } from "lucide-react";
import Logo from "@/components/landing/Logo";
import { enablePortForward } from "@/lib/mikrotik/port-forward";
import { resolveMikhmonCloudTunnel } from "@/lib/mikrotik/mikhmon-cloud-activation";
import { MIKHMON_EDITIONS, type MikhmonEditionId } from "@/lib/mikrotik/mikhmon-editions";
import RemoteAccessPaywallModal from "../remote-access/RemoteAccessPaywallModal";

type CloudRouter = {
  id: string;
  name: string;
  model: string | null;
  connectionMethod?: string;
  tunnelIp?: string | null;
};

const titleStyle = { fontFamily: '"Arial Black", Arial, sans-serif' };

export default function MikhmonCloudActivationDialog({
  open,
  onClose,
  router,
  superadmin,
}: {
  open: boolean;
  onClose: () => void;
  router: CloudRouter;
  superadmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [paywall, setPaywall] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* v6 par défaut ici : ce dialogue ne s'ouvre QUE pour les cartes sans
     conteneur, et l'édition v7 réclame une API que ces routeurs n'ont pas.
     Le choix reste offert — un RB4011 rétrogradé en 6.x existe. */
  const [edition, setEdition] = useState<MikhmonEditionId>("v6");
  const tunnel = resolveMikhmonCloudTunnel(router.connectionMethod, router.tunnelIp);

  if (!open) return null;

  function startActivation() {
    if (!tunnel.ready) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await enablePortForward(router.id, "mikhmon", "monthly", edition);
        if ("needsAuthorization" in result && result.needsAuthorization) {
          setPaywall(true);
          return;
        }
        if ("error" in result && result.error) {
          setError(result.error);
          return;
        }
        setActivated(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "L’activation n’a pas pu être terminée.");
      }
    });
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-[#12301D]/55 p-3 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`mikhmon-cloud-title-${router.id}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !pending) onClose();
        }}
      >
        <div className="mx-auto my-3 w-full max-w-6xl overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl sm:my-8">
          <header className="flex items-center justify-between border-b border-line-soft bg-white px-5 py-4 sm:px-7">
            <Logo />
            <button
              type="button"
              onClick={() => {
                if (activated && typeof window !== "undefined") {
                  window.location.reload();
                  return;
                }
                onClose();
              }}
              disabled={pending}
              aria-label="Fermer"
              className="rounded-full border border-line-soft p-2 text-ink-soft transition hover:border-line hover:bg-clay disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className={`grid lg:grid-cols-[220px_minmax(0,1fr)] ${activated ? "" : "xl:grid-cols-[220px_minmax(0,1fr)_258px]"}`}>
            <aside className="bg-[#12301D] px-5 py-6 text-paper sm:px-6 lg:min-h-[580px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
                Nouvelle liaison
              </p>
              <h2 className="mt-2 text-lg leading-tight text-white" style={titleStyle}>
                Création d’un accès
              </h2>

              <ol className="mt-8 space-y-5">
                {[
                  ["1", "Choisir le routeur", "Sélectionné"],
                  ["2", "Vérifier le tunnel", tunnel.ready ? "Disponible" : "À configurer"],
                  ["3", "Activer le service", superadmin ? "Accès superadmin" : "Facturation manuelle"],
                  ["4", "Recevoir le domaine", "Mise en ligne"],
                ].map(([number, label, note], index) => {
                  const active = index === 0 || (index === 1 && tunnel.ready);
                  return (
                    <li key={number} className="relative grid grid-cols-[25px_1fr] gap-2.5">
                      {index < 3 && <i className="absolute left-[11px] top-6 h-8 w-px bg-white/25" />}
                      <span
                        className={`relative z-10 grid h-[23px] w-[23px] place-items-center rounded-full border text-[10px] font-bold ${
                          active
                            ? "border-brand bg-brand text-[#12301D]"
                            : "border-white/40 text-white/70"
                        }`}
                      >
                        {number}
                      </span>
                      <span>
                        <strong className="block pt-0.5 text-xs text-white">{label}</strong>
                        <small className="mt-1 block text-[10px] text-white/65">{note}</small>
                      </span>
                    </li>
                  );
                })}
              </ol>

              <p className="mt-9 border-t border-white/25 pt-4 text-[11px] leading-5 text-white/75">
                La configuration de ce routeur reste inchangée : aucun Container, VETH ou NAT MikHmon ne sera ajouté.
              </p>
            </aside>

            <section className="p-5 sm:p-8">
              {activated ? (
                <div className="mx-auto flex max-w-lg flex-col items-start py-10">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-ink">
                    <Check className="h-6 w-6" />
                  </span>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-brand-deep">Activation lancée</p>
                  <h1 id={`mikhmon-cloud-title-${router.id}`} className="mt-2 text-2xl leading-tight text-[#12301D]" style={titleStyle}>
                    Votre domaine MikHmon est en préparation.
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-ink-soft">
                    SafeLinkHub vient de créer l’instance cloud reliée à {router.name}. La carte MikHmon Online affichera son domaine HTTPS dès le rafraîchissement.
                  </p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-7 rounded-full border border-[#12301D] bg-brand px-5 py-2.5 text-sm font-bold text-[#12301D] transition hover:brightness-95"
                  >
                    Voir MikHmon Online
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-deep">MikHmon Online</p>
                  <h1 id={`mikhmon-cloud-title-${router.id}`} className="mt-2 text-2xl leading-tight text-[#12301D] sm:text-3xl" style={titleStyle}>
                    Raccordez ce routeur à MikHmon.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">
                    L’application crée un domaine dédié sur l’infrastructure SafeLinkHub et le relie au tunnel déjà configuré sur le routeur.
                  </p>

                  <div className="mt-7 border-y border-line py-4">
                    <div className="grid grid-cols-[42px_1fr] items-center gap-3 sm:grid-cols-[42px_1fr_auto]">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-[#12301D]">
                        <RouterIcon className="h-5 w-5" />
                      </span>
                      <span>
                        <strong className="block text-sm text-ink">{router.name}</strong>
                        <small className="mt-1 block font-mono text-xs text-ink-soft">{router.model ?? "Modèle à confirmer"}</small>
                      </span>
                      <span className="col-start-2 mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-ok sm:col-start-auto sm:mt-0">
                        <i className="h-2 w-2 rounded-full bg-brand ring-1 ring-ink" /> Tunnel {tunnel.ready ? "disponible" : "à configurer"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.13em] text-ink-soft">
                      Liaison détectée <i className="h-px flex-1 bg-line-soft" />
                    </div>
                    <div className="mt-3 divide-y divide-line-soft border-y border-line-soft">
                      <ProtocolRow
                        title="WireGuard"
                        detail="RouterOS 7.0 à 7.24.1 — le tunnel WireGuard existant est utilisé."
                        selected={tunnel.id === "wireguard"}
                      />
                      <ProtocolRow
                        title="OpenVPN"
                        detail="RouterOS 6.x — le tunnel OpenVPN existant est utilisé."
                        selected={tunnel.id === "openvpn"}
                      />
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.13em] text-ink-soft">
                      Édition de MikHmon <i className="h-px flex-1 bg-line-soft" />
                    </div>
                    <div className="mt-3 divide-y divide-line-soft border-y border-line-soft">
                      {(["v6", "v7"] as const).map((id) => {
                        const e = MIKHMON_EDITIONS[id];
                        const choisi = edition === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setEdition(id)}
                            aria-pressed={choisi}
                            className="grid w-full grid-cols-[20px_1fr] items-start gap-3 py-3 text-left"
                          >
                            <span
                              className={`mt-0.5 h-[18px] w-[18px] rounded-full ${
                                choisi ? "border-[5px] border-[#12301D] bg-brand" : "border border-line bg-white"
                              }`}
                            />
                            <span>
                              <strong className="block text-sm text-ink">{e.label}</strong>
                              <small className="mt-1 block text-xs leading-5 text-ink-soft">
                                {e.origine} {e.audience}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {tunnel.ready ? (
                    <div className="mt-5 grid grid-cols-[22px_1fr] gap-3 border-l-4 border-brand bg-clay px-4 py-3 text-sm leading-6 text-ink-soft">
                      <Cloud className="mt-0.5 h-5 w-5 text-brand-deep" />
                      <p>
                        MikHmon est déployé dans le cloud SafeLinkHub. Votre routeur reste inchangé : aucune couche Container n’est écrite sur son stockage.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 grid grid-cols-[22px_1fr] gap-3 border-l-4 border-warn bg-clay px-4 py-3 text-sm leading-6 text-ink-soft">
                      <ShieldCheck className="mt-0.5 h-5 w-5 text-warn" />
                      <p>Configurez d’abord le tunnel SafeLinkHub de ce routeur. L’instance cloud ne peut pas joindre une connexion directe ou sans adresse de tunnel.</p>
                    </div>
                  )}

                  {requestSubmitted && (
                    <p className="mt-4 border border-ok/30 bg-ok/10 px-4 py-3 text-sm leading-6 text-ok">
                      Votre demande de facturation a été envoyée. Dès qu’elle est approuvée, revenez ici pour finaliser l’activation.
                    </p>
                  )}
                  {error && <p className="mt-4 border border-err/30 bg-err/10 px-4 py-3 text-sm leading-6 text-err">{error}</p>}

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                    <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-soft hover:text-ink">
                      ← Retour à MikHmon Online
                    </button>
                    <button
                      type="button"
                      onClick={startActivation}
                      disabled={!tunnel.ready || pending}
                      className="inline-flex items-center gap-2 rounded-full border border-[#12301D] bg-brand px-5 py-2.5 text-sm font-bold text-[#12301D] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {superadmin ? "Activer le domaine" : "Continuer vers la facturation"}
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* « Ce qui sera créé » — la colonne que la maquette pose à droite.
                Masquée une fois l'activation lancée : à ce moment-là elle
                annoncerait au futur ce que l'écran de succès dit au passé. */}
            {!activated && (
              <aside className="border-t border-line bg-clay px-5 py-6 xl:border-l xl:border-t-0">
                <i className="block h-1 w-7 bg-brand" />
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                  Ce qui sera créé
                </p>
                <h2 className="mt-2 text-base leading-tight text-[#12301D]" style={titleStyle}>
                  Un accès distinct pour ce routeur.
                </h2>

                <dl className="mt-4">
                  <Fait titre="Un domaine dédié">
                    Une adresse MikHmon propre à {router.name}, disponible après l’activation.
                  </Fait>
                  <Fait titre="Aucun service à héberger">
                    Le tableau MikHmon tourne dans l’infrastructure SafeLinkHub, pas sur le routeur.
                  </Fait>
                  <Fait titre="Activation maîtrisée">
                    {superadmin
                      ? "Votre compte active le domaine immédiatement, sans passer par le paiement."
                      : "La facturation est validée depuis MikHmon Online avant la mise en ligne."}
                  </Fait>
                </dl>

                {superadmin && (
                  <div className="mt-5 border border-[#12301D] bg-white p-3">
                    <strong className="block text-[11px] text-ink">Vous êtes superadmin</strong>
                    <p className="mt-1 text-[11px] leading-5 text-ink-soft">
                      L’accès reste activable sans paiement ; la confirmation sert simplement à
                      tracer le déploiement.
                    </p>
                  </div>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>

      {paywall && (
        <RemoteAccessPaywallModal
          open
          onClose={() => setPaywall(false)}
          routerId={router.id}
          service="mikhmon"
          initialPeriod="monthly"
          latestStatus={null}
          onSubmitted={() => {
            setPaywall(false);
            setRequestSubmitted(true);
          }}
        />
      )}
    </>
  );
}

function ProtocolRow({ title, detail, selected }: { title: string; detail: string; selected: boolean }) {
  return (
    <div className="grid grid-cols-[18px_1fr_auto] gap-3 py-3.5">
      <span
        className={`mt-0.5 h-[18px] w-[18px] rounded-full border ${
          selected ? "border-[5px] border-[#12301D] bg-brand" : "border-line-soft bg-paper"
        }`}
        aria-hidden="true"
      />
      <span>
        <strong className="block text-sm text-ink">{title}</strong>
        <small className="mt-1 block text-xs leading-5 text-ink-soft">{detail}</small>
      </span>
      {selected && <span className="mt-0.5 bg-brand px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#12301D]">Détecté</span>}
    </div>
  );
}

/** Une ligne de la colonne « ce qui sera créé » : intitulé, puis conséquence. */
function Fait({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line-soft py-4 first:border-t-[#12301D]">
      <dt className="text-xs font-bold text-ink">{titre}</dt>
      <dd className="mt-1 text-[11px] leading-5 text-ink-soft">{children}</dd>
    </div>
  );
}
