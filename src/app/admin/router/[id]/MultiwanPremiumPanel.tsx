"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  GitFork,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import {
  generatePaidMultiwan,
  payMultiwanPremium,
  readMultiwanPremium,
} from "@/lib/multiwan/actions";
import {
  defaultMultiwanConfig,
  validateMultiwan,
  type MultiwanConfig,
  type MultiwanWan,
} from "@/lib/multiwan/config";
import { formatSc } from "@/lib/safecoin/pricing";

type Status = Exclude<
  Awaited<ReturnType<typeof readMultiwanPremium>>,
  { error: string }
>;
const BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-bold text-ink transition hover:bg-clay disabled:cursor-not-allowed disabled:opacity-50";
const primary = {
  backgroundColor: "var(--brand)",
  borderColor: "var(--brand)",
  color: "var(--slate-deep)",
};
const money = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
const MODES = {
  local: {
    label: "Local",
    hint: "Contrôle de la passerelle de chaque fournisseur.",
  },
  recursive: {
    label: "Récursif",
    hint: "Contrôle d’une cible Internet par connexion.",
  },
  hybrid: {
    label: "Hybride",
    hint: "Contrôle de la passerelle et de deux cibles Internet par connexion.",
  },
};

export default function MultiwanPremiumPanel({
  routerId,
}: {
  routerId: string;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [config, setConfig] = useState<MultiwanConfig | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [script, setScript] = useState("");
  const [pending, start] = useTransition(),
    [source, setSource] = useState<"wallet" | "safecoin">("wallet");
  const [confirm, setConfirm] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    readMultiwanPremium(routerId)
      .then((r) => {
        if (!alive) return;
        if ("error" in r) setError(r.error ?? "Module indisponible.");
        else {
          setStatus(r);
          setConfig(r.config);
          setSource(r.walletBalance >= r.priceFcfa ? "wallet" : "safecoin");
        }
      })
      .catch(() => {
        if (alive) setError("Impossible de charger le module. Réessayez.");
      });
    return () => {
      alive = false;
    };
  }, [routerId]);
  const change = (patch: Partial<MultiwanConfig>) => {
    if (config) setConfig({ ...config, ...patch });
    setScript("");
    setMessage("");
    setConfirm(false);
  };
  const wan = (i: number, patch: Partial<MultiwanWan>) =>
    config &&
    change({
      wans: config.wans.map((w, j) => (i === j ? { ...w, ...patch } : w)),
    });
  const resize = (count: number) =>
    config &&
    change({
      wans: defaultMultiwanConfig(count).wans.map(
        (w, i) => config.wans[i] ?? w,
      ),
    });
  const generate = () =>
    start(async () => {
      if (!config) return;
      setMessage("");
      setError("");
      try {
        const r = await generatePaidMultiwan(routerId, config);
        if ("error" in r) setError(r.error ?? "Génération impossible.");
        else {
          setScript(r.script);
          setMessage("Script généré. Vous pouvez le copier ou le télécharger.");
        }
      } catch {
        setError(
          "La génération a échoué. Aucun nouveau paiement n’est nécessaire pour réessayer.",
        );
      }
    });
  const pay = () =>
    start(async () => {
      if (!status) return;
      setError("");
      setMessage("");
      try {
        const r = await payMultiwanPremium(routerId, source, status.rate);
        if ("error" in r) {
          setError(r.error ?? "Paiement refusé.");
          return;
        }
        const fresh = await readMultiwanPremium(routerId);
        if ("error" in fresh) throw new Error();
        setStatus(fresh);
        setConfirm(false);
        setMessage(
          r.alreadyPaid
            ? "Ce routeur est déjà activé. Aucun nouveau débit."
            : "Paiement confirmé. Vous pouvez générer les scripts de ce routeur sans nouveau paiement.",
        );
      } catch {
        setError(
          "Le résultat du paiement n’a pas pu être chargé. Actualisez avant de réessayer ; un achat déjà confirmé ne sera pas débité deux fois.",
        );
      }
    });
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([script], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `safelinkhub-multiwan-${routerId}.rsc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie indisponible. Téléchargez le fichier .rsc.");
    }
  };
  const invalid = config ? validateMultiwan(config) : null;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <GitFork className="h-5 w-5 text-brand-deep" aria-hidden="true" />
            Multi-WAN Premium
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
            Répartissez les connexions entre 2 à 6 fournisseurs et préparez le
            basculement vers un lien de secours. Script personnalisé pour ce
            routeur, sans installation automatique.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${status?.paid ? "bg-ok-soft text-ok" : "bg-clay text-brand-deep"}`}
        >
          {status?.paid ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Activé pour ce routeur
            </>
          ) : (
            <>30 000 FCFA · paiement unique</>
          )}
        </span>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-err/30 bg-err-soft p-4 text-sm text-err"
        >
          {error}
        </p>
      )}
      {!status && !error && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-ink-soft"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement du module…
        </p>
      )}
      {status && config && (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
            <fieldset
              disabled={pending || !status.canManage}
              className="min-w-0 space-y-4 disabled:opacity-70"
            >
              <section className="rounded-xl border border-line bg-paper p-4 sm:p-5">
                <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Configuration des connexions
                </h3>
                <label className="block text-sm font-semibold">
                  Version RouterOS
                  <select
                    className="field mt-1"
                    value={config.version}
                    onChange={(e) =>
                      change({
                        version: e.target.value as MultiwanConfig["version"],
                      })
                    }
                  >
                    <option value="6">RouterOS 6</option>
                    <option value="7">RouterOS 7</option>
                  </select>
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  Réseau desservi
                  <select
                    className="field mt-1"
                    value={config.network}
                    onChange={(e) =>
                      change({
                        network: e.target.value as MultiwanConfig["network"],
                      })
                    }
                  >
                    <option value="routed">
                      LAN routé · répartition PCC + secours
                    </option>
                    <option value="hotspot">
                      Hotspot · basculement de secours
                    </option>
                  </select>
                </label>
                <p className="mt-2 text-xs leading-5 text-ink-soft">
                  {config.network === "hotspot"
                    ? "Le Hotspot utilise la table principale : ce mode privilégie un WAN et bascule vers les suivants. Il ne répartit pas les sessions par PCC."
                    : "Le PCC répartit les connexions à parts égales entre les WAN. Un téléchargement unique ne cumule pas leurs débits. FastTrack doit être désactivé ou adapté avant import."}
                </p>
                {status.hotspot.length > 0 && config.network === "routed" && (
                  <p className="mt-2 text-xs leading-5 text-warn">
                    Hotspot configuré sur {status.hotspot.join(", ")}. Utilisez
                    le mode Hotspot pour ce réseau ; réservez le PCC à une
                    interface LAN routée distincte.
                  </p>
                )}
                <label className="mt-4 block text-sm font-semibold">
                  Méthode de basculement
                  <select
                    className="field mt-1"
                    value={config.failover}
                    onChange={(e) =>
                      change({
                        failover: e.target.value as MultiwanConfig["failover"],
                      })
                    }
                  >
                    {Object.entries(MODES).map(([key, m]) => (
                      <option key={key} value={key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs leading-5 text-ink-soft">
                  {MODES[config.failover].hint}
                </p>
                <label className="mt-4 block text-sm font-semibold">
                  Nombre de connexions : {config.wans.length}
                  <input
                    type="range"
                    min="2"
                    max="6"
                    step="1"
                    value={config.wans.length}
                    onChange={(e) => resize(Number(e.target.value))}
                    className="mt-3 w-full accent-brand-deep"
                  />
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="text-sm">
                    Interface LAN
                    <input
                      className="field mt-1"
                      value={config.lanInterface}
                      onChange={(e) => change({ lanInterface: e.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    Sous-réseau LAN (IPv4/CIDR)
                    <input
                      className="field mt-1"
                      value={config.lanCidr}
                      onChange={(e) => change({ lanCidr: e.target.value })}
                      placeholder="192.168.88.0/24"
                    />
                  </label>
                </div>
              </section>
              <section className="rounded-xl border border-line bg-paper p-4 sm:p-5">
                <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Interfaces et passerelles
                </h3>
                <div className="space-y-3">
                  {config.wans.map((w, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-line-soft bg-clay/40 p-3"
                    >
                      <p className="mb-3 text-sm font-bold text-ink">
                        Connexion {i + 1}
                        {config.network === "hotspot" && i === 0
                          ? " · principale"
                          : ""}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <label className="text-xs font-semibold">
                          Interface WAN {i + 1}
                          <input
                            className="field mt-1"
                            value={w.interface}
                            onChange={(e) =>
                              wan(i, { interface: e.target.value })
                            }
                          />
                        </label>
                        <label className="text-xs font-semibold">
                          Passerelle WAN {i + 1}
                          <input
                            className="field mt-1"
                            value={w.gateway}
                            onChange={(e) =>
                              wan(i, { gateway: e.target.value })
                            }
                          />
                        </label>
                        {config.failover !== "local" && (
                          <label className="text-xs font-semibold">
                            Cible Internet WAN {i + 1}
                            <input
                              className="field mt-1"
                              value={w.probe}
                              onChange={(e) =>
                                wan(i, { probe: e.target.value })
                              }
                            />
                          </label>
                        )}
                        {config.failover === "hybrid" && (
                          <label className="text-xs font-semibold">
                            Seconde cible WAN {i + 1}
                            <input
                              className="field mt-1"
                              value={w.probe2}
                              onChange={(e) =>
                                wan(i, { probe2: e.target.value })
                              }
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </fieldset>
            <div className="min-w-0 space-y-4 xl:sticky xl:top-5">
              <section className="overflow-hidden rounded-xl border border-line bg-paper">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
                  <h3 className="text-sm font-bold text-ink">
                    Script MikroTik · {status.routerName}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!script || pending}
                      onClick={copy}
                      className={BUTTON}
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "Copié" : "Copier"}
                    </button>
                    <button
                      type="button"
                      disabled={!script || pending}
                      onClick={download}
                      className={BUTTON}
                    >
                      <Download className="h-4 w-4" />
                      .rsc
                    </button>
                  </div>
                </div>
                {script ? (
                  <pre
                    tabIndex={0}
                    className="max-h-[650px] overflow-auto bg-slate-deep p-4 font-mono text-xs leading-6 text-paper sm:p-5"
                    aria-label="Script RouterOS généré"
                  >
                    <code>{script}</code>
                  </pre>
                ) : (
                  <div className="grid min-h-72 place-items-center px-6 py-10 text-center">
                    <div>
                      <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-brand text-slate-deep">
                        {status.paid ? (
                          <GitFork className="h-6 w-6" />
                        ) : (
                          <LockKeyhole className="h-6 w-6" />
                        )}
                      </span>
                      <p className="font-bold text-ink">
                        {status.paid
                          ? "Votre générateur est prêt"
                          : "Un script adapté à votre routeur"}
                      </p>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
                        {config.wans.length} connexions · RouterOS{" "}
                        {config.version} · {MODES[config.failover].label} ·{" "}
                        {config.network === "hotspot"
                          ? "basculement Hotspot"
                          : "répartition PCC"}
                        .
                      </p>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
                        {status.paid
                          ? "Ajustez les interfaces puis générez une nouvelle version, sans nouveau paiement."
                          : "Configurez vos connexions librement. Le script complet sera disponible après activation pour ce routeur."}
                      </p>
                    </div>
                  </div>
                )}
              </section>
              {invalid && (
                <p
                  role="alert"
                  className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-sm text-warn"
                >
                  {invalid}
                </p>
              )}
              {!status.canManage ? (
                <p className="text-sm text-ink-soft">
                  Un administrateur ou un éditeur habilité doit activer et
                  générer la configuration.
                </p>
              ) : status.paid ? (
                <button
                  type="button"
                  onClick={generate}
                  disabled={pending || Boolean(invalid)}
                  className={`${BUTTON} w-full`}
                  style={primary}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GitFork className="h-4 w-4" />
                  )}
                  {script ? "Régénérer le script" : "Générer mon script"} ·
                  inclus
                </button>
              ) : (
                <section className="rounded-xl border border-line bg-paper p-4 sm:p-5">
                  <h3 className="font-bold text-ink">
                    Activer pour {money(status.priceFcfa)}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">
                    Un seul paiement pour ce routeur dans votre organisation.
                    Régénérations incluses, sans abonnement. Ce tarif concerne
                    le générateur de scripts ; les services d’installation
                    existants restent distincts.
                  </p>
                  <fieldset disabled={pending} className="mt-4 space-y-3">
                    <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
                      Choisir le solde à débiter
                    </legend>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm">
                      <input
                        className="mt-1 accent-brand-deep"
                        type="radio"
                        name={`multiwan-source-${routerId}`}
                        checked={source === "wallet"}
                        onChange={() => {
                          setSource("wallet");
                          setConfirm(false);
                        }}
                      />
                      <span>
                        <strong>
                          Portefeuille · {money(status.priceFcfa)}
                        </strong>
                        <span className="mt-1 block text-xs text-ink-soft">
                          Solde disponible : {money(status.walletBalance)}
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm">
                      <input
                        className="mt-1 accent-brand-deep"
                        type="radio"
                        name={`multiwan-source-${routerId}`}
                        checked={source === "safecoin"}
                        onChange={() => {
                          setSource("safecoin");
                          setConfirm(false);
                        }}
                      />
                      <span>
                        <strong>SafeCoin · {formatSc(status.scCost)}</strong>
                        <span className="mt-1 block text-xs text-ink-soft">
                          Solde : {formatSc(status.scBalance)} · 1 SC ={" "}
                          {money(status.rate)}
                        </span>
                      </span>
                    </label>
                  </fieldset>
                  {(
                    source === "wallet"
                      ? status.walletBalance < status.priceFcfa
                      : status.scBalance < status.scCost
                  ) ? (
                    <p className="mt-4 text-sm text-warn">
                      Solde insuffisant pour ce moyen de paiement.{" "}
                      <Link
                        href="/admin/billing"
                        className="font-bold underline"
                      >
                        Recharger mon portefeuille
                      </Link>
                    </p>
                  ) : confirm ? (
                    <div className="mt-4 rounded-lg border border-brand-deep/30 bg-clay p-4">
                      <p className="text-sm leading-6 text-ink">
                        Confirmer le débit de{" "}
                        <strong>
                          {source === "wallet"
                            ? money(status.priceFcfa)
                            : formatSc(status.scCost)}
                        </strong>{" "}
                        pour <strong>{status.routerName}</strong> ?
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={pay}
                          className={BUTTON}
                          style={primary}
                        >
                          {pending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Confirmer le paiement
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirm(false)}
                          className={BUTTON}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={pending || Boolean(invalid)}
                      onClick={() => setConfirm(true)}
                      className={`${BUTTON} mt-4 w-full`}
                      style={primary}
                    >
                      <LockKeyhole className="h-4 w-4" />
                      Activer pour ce routeur
                    </button>
                  )}
                </section>
              )}
              <details className="rounded-xl border border-line bg-paper p-4">
                <summary className="cursor-pointer text-sm font-bold text-ink">
                  Avant d’importer le script
                </summary>
                <p className="mt-3 text-sm leading-6 text-ink-soft">
                  Sauvegardez votre configuration et importez en Safe Mode. Les
                  WAN doivent déjà posséder une adresse et une passerelle
                  valides. Vérifiez les routes et règles de routage existantes,
                  puis testez la perte de chaque lien. Le script renouvelle ses
                  propres objets ; il conserve les DNS, filtres et tunnels
                  existants. Une configuration multi-WAN peut changer les
                  chemins de sortie : leur fonctionnement doit être vérifié
                  après import.
                </p>
                <p className="mt-2 text-xs text-ink-soft">
                  Les précontrôles refusent le PCC sur une interface Hotspot ou
                  avec FastTrack actif. Les noms d’interface acceptent lettres,
                  chiffres, point, tiret, deux-points et soulignement.
                </p>
              </details>
            </div>
          </div>
        </>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-ok/30 bg-ok-soft p-4 text-sm text-ok"
        >
          {message}
        </p>
      )}
    </div>
  );
}
