"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ShieldBan,
  Loader2,
  RefreshCw,
  Trash2,
  Terminal,
  Copy,
  Check,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  applyRouterContentFilter,
  buildRouterContentFilterScript,
  readRouterContentFilter,
  removeRouterContentFilter,
} from "@/lib/mikrotik/content-filter-actions";
import {
  CONTENT_CATEGORIES,
  type ContentCategoryKey,
  type ContentFilterState,
} from "@/lib/mikrotik/content-filter";

/* Par défaut on coche ce qu'un opérateur de hotspot public veut couper le jour
   où il ouvre cet écran ; « piracy » et « malware » restent à sa main. */
const DEFAUT: ContentCategoryKey[] = ["adult", "torrent", "gambling"];

type Msg = { ok: boolean; text: string; notes?: string[]; failed?: { step: string; error: string }[] };

function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 border border-line bg-paper p-3 transition-colors duration-150 hover:bg-clay rounded-xl">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
      />
      <span>
        <span className="block text-sm font-bold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>
      </span>
    </label>
  );
}

export default function ContentFilterPanel({ routerId }: { routerId: string }) {
  const [categories, setCategories] = useState<ContentCategoryKey[]>(DEFAUT);
  const [keywords, setKeywords] = useState(true);
  const [forceDns, setForceDns] = useState(true);
  const [adlist, setAdlist] = useState(true);

  const [state, setState] = useState<ContentFilterState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [script, setScript] = useState<{ version: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [isReading, startRead] = useTransition();
  const [isWriting, startWrite] = useTransition();

  function refresh() {
    startRead(async () => {
      setStateError(null);
      const res = await readRouterContentFilter(routerId);
      if ("error" in res) {
        setStateError(res.error);
        setState(null);
        return;
      }
      setState(res.state);
    });
  }

  useEffect(refresh, [routerId]);

  const toggle = (key: ContentCategoryKey) =>
    setCategories((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  function apply() {
    startWrite(async () => {
      setMsg(null);
      setScript(null);
      const res = await applyRouterContentFilter(routerId, { categories, keywords, forceDns, adlist });
      if ("error" in res && res.error) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: res.summary!, notes: res.notes, failed: res.failed });
      refresh();
    });
  }

  function remove() {
    startWrite(async () => {
      setMsg(null);
      setScript(null);
      const res = await removeRouterContentFilter(routerId);
      if ("error" in res && res.error) return setMsg({ ok: false, text: res.error });
      setMsg({ ok: true, text: res.summary!, failed: res.failed });
      refresh();
    });
  }

  function showScript(versionOverride?: string) {
    startWrite(async () => {
      setMsg(null);
      const res = await buildRouterContentFilterScript(
        routerId,
        { categories, keywords, forceDns, adlist },
        versionOverride,
      );
      if ("error" in res && res.error) return setMsg({ ok: false, text: res.error });
      setScript({ version: res.version!, text: res.script! });
      setCopied(false);
      if (res.notes?.length) setMsg({ ok: true, text: `Script généré pour RouterOS ${res.version}.`, notes: res.notes });
    });
  }

  const busy = isWriting || isReading;

  return (
    <div className="space-y-6">
      {/* ── État courant ── */}
      <div className="flex flex-col gap-4 border border-line bg-paper p-5 sm:flex-row sm:items-center sm:justify-between rounded-xl">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center border border-line bg-brand rounded-xl"
          >
            <ShieldBan className="h-5 w-5 text-slate-deep" />
          </span>
          <div>
            <p className="font-display text-lg font-bold text-ink">
              {state?.installed ? "Filtre de contenu actif" : "Filtre de contenu non posé"}
            </p>
            <p className="text-sm text-ink-soft">
              {stateError
                ? stateError
                : state
                  ? `RouterOS ${state.rawVersion || `${state.version.major}.${state.version.minor}`} · ` +
                    `${state.dnsEntries} domaines DNS · ${state.firewallRules} règles firewall · ` +
                    `${state.natRules} règles NAT · ${state.adlists.length} liste(s) publique(s)`
                  : "Lecture de l'état du routeur…"}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={refresh}
          className="flex shrink-0 items-center gap-1.5 self-start border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60 rounded-xl"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isReading ? "animate-spin" : ""}`} />
          Relire
        </button>
      </div>

      {/* ── Catégories ── */}
      <div>
        <h3 className="font-display text-base font-bold text-ink">Ce qui est bloqué</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {CONTENT_CATEGORIES.map((c) => (
            <Checkbox
              key={c.key}
              checked={categories.includes(c.key)}
              onChange={() => toggle(c.key)}
              label={c.label}
              hint={c.description}
            />
          ))}
        </div>
      </div>

      {/* ── Options ── */}
      <div>
        <h3 className="font-display text-base font-bold text-ink">Comment</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Checkbox
            checked={forceDns}
            onChange={setForceDns}
            label="Forcer le DNS"
            hint="Renvoie tout le port 53 sur le routeur et coupe le DNS-over-TLS. Sans ça, régler 8.8.8.8 à la main contourne le filtre."
          />
          <Checkbox
            checked={keywords}
            onChange={setKeywords}
            label="Blocage par mot-clé (SNI)"
            hint="Attrape aussi les domaines absents des listes. Peut rejeter un site légitime dont le nom contient un mot bloqué."
          />
          <Checkbox
            checked={adlist}
            onChange={setAdlist}
            label="Listes publiques"
            hint="Des dizaines de milliers de domaines chargés par le routeur. RouterOS 7.15+ uniquement ; demande de la RAM libre."
          />
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || categories.length === 0}
          onClick={apply}
          className="inline-flex items-center gap-2 border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep transition-colors duration-150 hover:bg-ink hover:text-paper disabled:opacity-60 rounded-full"
        >
          {isWriting ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldBan aria-hidden="true" className="h-4 w-4" />
          )}
          {state?.installed ? "Ré-appliquer le filtre" : "Injecter le filtre"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => showScript()}
          className="inline-flex items-center gap-2 border border-line bg-paper px-4 py-2.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60 rounded-full"
        >
          <Terminal aria-hidden="true" className="h-4 w-4" />
          Voir le script
        </button>
        {state?.installed && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="inline-flex items-center gap-2 border border-err px-4 py-2.5 text-sm font-bold text-err transition-colors duration-150 hover:bg-err/10 disabled:opacity-60 rounded-full"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Retirer le filtre
          </button>
        )}
      </div>

      {/* ── Retour ── */}
      {msg && (
        <div
          role="status"
          className={`border px-4 py-3 text-sm rounded-xl ${
            msg.ok ? "border-ok bg-ok/10 text-ink" : "border-err bg-err/10 text-err"
          }`}
        >
          <p className="font-medium">{msg.text}</p>
          {msg.notes && msg.notes.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {msg.notes.map((n) => (
                <li key={n} className="flex gap-2 text-xs text-ink-soft">
                  <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
          {msg.failed && msg.failed.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-bold text-warn">
                <AlertTriangle aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
                {msg.failed.length} commande(s) refusée(s) par le routeur
              </summary>
              <ul className="mt-1.5 space-y-1 font-mono text-[11px] text-ink-soft">
                {msg.failed.map((f) => (
                  <li key={f.step}>
                    {f.step} → {f.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ── Script copier-coller (routeur injoignable, ou injection manuelle) ── */}
      {script && (
        <div className="border border-line bg-paper p-4 rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-sm font-bold text-ink">
              Script RouterOS {script.version} — à coller dans le terminal du routeur
            </p>
            <div className="flex items-center gap-2">
              {/* La branche est déduite du routeur quand il répond ; sinon (ou
                  pour préparer un autre boîtier) l'opérateur la force ici. */}
              <button
                type="button"
                disabled={busy}
                onClick={() => showScript("6.49.10")}
                className="border border-line px-2.5 py-1 font-mono text-xs font-bold text-ink hover:bg-clay disabled:opacity-60 rounded-lg"
              >
                Forcer v6
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => showScript("7.23.1")}
                className="border border-line px-2.5 py-1 font-mono text-xs font-bold text-ink hover:bg-clay disabled:opacity-60 rounded-lg"
              >
                Forcer v7
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(script.text).then(() => setCopied(true));
                }}
                className="inline-flex items-center gap-1.5 border border-line bg-brand px-2.5 py-1 text-xs font-bold text-slate-deep hover:bg-ink hover:text-paper rounded-lg"
              >
                {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto border border-line-soft bg-clay p-3 font-mono text-[11px] leading-relaxed text-ink">
            {script.text}
          </pre>
        </div>
      )}
    </div>
  );
}
