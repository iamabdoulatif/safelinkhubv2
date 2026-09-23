"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, EyeOff, Loader2, RotateCcw, Search } from "lucide-react";
import {
  applyWanStealth,
  readWanStealth,
  restoreWanIdentity,
} from "@/lib/mikrotik/wan-stealth-actions";

type Lecture = Extract<Awaited<ReturnType<typeof readWanStealth>>, { success: true }>;
type Resultat = { faits: string[]; echecs: string[]; summary: string };

/**
 * Ce que le routeur raconte de lui-même au FAI — et le bouton qui le fait
 * taire. L'écran dit aussi, noir sur blanc, ce qu'il ne sait PAS cacher : le
 * volume. Promettre l'inverse ferait prendre des décisions sur du vent.
 */
export default function WanStealthPanel({ routerId }: { routerId: string }) {
  const [pending, startTransition] = useTransition();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [label, setLabel] = useState("");
  const [spoofMac, setSpoofMac] = useState(false);
  const [hideUpstream, setHideUpstream] = useState(false);

  const analyser = useCallback(() => {
    startTransition(async () => {
      setErreur(null);
      setResultat(null);
      const res = await readWanStealth(routerId);
      if (!res || "error" in res) {
        setErreur((res && "error" in res && res.error) || "Lecture impossible.");
        setLecture(null);
        return;
      }
      setLecture(res);
    });
  }, [routerId]);

  useEffect(() => {
    analyser();
  }, [analyser]);

  const poser = () => {
    if (
      spoofMac &&
      !window.confirm(
        "Remplacer la MAC d'usine coupe le lien WAN quelques secondes (nouveau bail DHCP) : les clients connectés perdent Internet le temps de la renégociation. Continuer ?",
      )
    ) {
      return;
    }
    setErreur(null);
    setResultat(null);
    startTransition(async () => {
      const res = await applyWanStealth(routerId, { label, spoofMac, hideUpstream });
      if (!res || "error" in res) {
        setErreur((res && "error" in res && res.error) || "Pose impossible.");
        return;
      }
      setResultat({ faits: res.faits, echecs: res.echecs, summary: res.summary ?? "" });
      analyser();
    });
  };

  const retablir = () => {
    if (!window.confirm("Rétablir la MAC d'usine et le nom d'hôte système ? Le lien WAN sera renégocié.")) return;
    setErreur(null);
    setResultat(null);
    startTransition(async () => {
      const res = await restoreWanIdentity(routerId);
      if (!res || "error" in res) {
        setErreur((res && "error" in res && res.error) || "Rétablissement impossible.");
        return;
      }
      setResultat({ faits: res.faits, echecs: res.echecs, summary: res.summary ?? "" });
      analyser();
    });
  };

  const leaks = lecture?.leaks ?? [];
  const aCorriger = leaks.filter((l) => l.fixable);

  return (
    <section className="mt-6 border border-line bg-paper p-4 rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <EyeOff className="h-4 w-4" />
          Discrétion côté FAI
        </h2>
        <button
          type="button"
          onClick={analyser}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ok disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Analyser
        </button>
      </div>

      <p className="mt-2 text-xs leading-5 text-ink-soft">
        Un MikroTik s&apos;annonce au réseau du fournisseur par sa MAC d&apos;usine (OUI déposé au
        nom de «&nbsp;Routerboard.com&nbsp;», c&apos;est ce que l&apos;application Starlink affiche),
        par le nom d&apos;hôte de ses baux DHCP, par la découverte de voisinage et par le DDNS
        MikroTik. Tout cela se tait.{" "}
        <strong className="text-ink">
          Le volume échangé, lui, ne peut pas être masqué
        </strong>{" "}
        : il est compté par le fournisseur sur son propre réseau, et aucun réglage du routeur
        client n&apos;y change quoi que ce soit.
      </p>

      {erreur && <p className="mt-3 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{erreur}</p>}

      {lecture && (
        <>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {lecture.links.map((l) => (
              <li key={l.name} className="border border-line-soft bg-clay px-3 py-2 rounded-lg text-xs">
                <span className="font-bold text-ink">{l.name}</span>
                <span className="mt-0.5 block font-mono text-ink-soft">{l.mac}</span>
                <span className="mt-0.5 block text-ink-soft">
                  {l.usine ? "MAC d'usine — vendeur visible" : "MAC masquée"} · nom annoncé :{" "}
                  <span className="font-mono">{l.nomEnvoye}</span>
                  {l.identiteSysteme && " (identité système)"}
                </span>
              </li>
            ))}
            {lecture.links.length === 0 && (
              <li className="text-xs text-ink-soft">Aucun lien WAN ethernet identifié.</li>
            )}
          </ul>

          {leaks.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-ok">
              <CheckCircle2 className="h-4 w-4" />
              Ce routeur n&apos;annonce plus rien d&apos;identifiable côté WAN.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {leaks.map((l) => (
                <li
                  key={l.id}
                  className={`border-l-2 px-3 py-2 text-xs rounded-r-lg ${
                    l.fixable ? "border-warn bg-warn-soft" : "border-line bg-clay"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold text-ink">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {l.label}
                    {l.interfaces && <span className="font-normal text-ink-soft">· {l.interfaces.join(", ")}</span>}
                  </span>
                  <span className="mt-0.5 block leading-5 text-ink-soft">{l.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="text-xs font-bold text-ink-soft">
            Nom à présenter au fournisseur <span className="font-normal">(facultatif)</span>
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="E1-WAN-FAI"
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
          />
          <span className="mt-0.5 block text-xs text-ink-soft">
            Laissé vide, chaque lien annonce son propre nom d&apos;interface
            {lecture?.links.length ? ` (${lecture.links.map((l) => l.name).join(", ")})` : ""}.
            Lettres, chiffres et tirets. Remplace l&apos;identité système dans l&apos;option DHCP 12
            — le nom du routeur dans SafeLinkHub ne change pas.
          </span>
        </label>
        <button
          type="button"
          onClick={poser}
          disabled={pending || !lecture}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
          Masquer
        </button>
      </div>

      <label className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={spoofMac}
          onChange={(e) => setSpoofMac(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          Remplacer aussi la MAC d&apos;usine par une adresse locale (sans vendeur).
          <span className="block text-xs">
            C&apos;est le seul réglage qui change le nom affiché par l&apos;application du
            fournisseur — mais il renégocie le bail DHCP : coupure de quelques secondes, réversible
            à tout moment.
          </span>
        </span>
      </label>

      <label className="mt-2 flex items-start gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={hideUpstream}
          onChange={(e) => setHideUpstream(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          Couper l&apos;accès des clients à l&apos;équipement du fournisseur.
          <span className="block text-xs">
            Sans cela, n&apos;importe quel client du hotspot ouvre le tableau de bord de
            l&apos;antenne et y lit le numéro de série
            {lecture?.upstreamTargets?.length
              ? ` (${lecture.upstreamTargets.join(", ")})`
              : ""}
            . Règles de rejet en tête du forward, retirées par «&nbsp;Rétablir&nbsp;».
          </span>
        </span>
      </label>

      {aCorriger.length > 0 && !pending && (
        <p className="mt-2 text-xs text-ink-soft">
          {aCorriger.length} réglage(s) seront posés.
        </p>
      )}

      {resultat && (
        <div className="mt-3 border border-line-soft bg-clay p-3 rounded-lg text-xs">
          <p className="font-bold text-ink">{resultat.summary}</p>
          {resultat.faits.map((f) => (
            <p key={f} className="mt-1 text-ok">
              ✓ {f}
            </p>
          ))}
          {resultat.echecs.map((e) => (
            <p key={e} className="mt-1 text-err">
              ✗ {e}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={retablir}
        disabled={pending || !lecture}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-60"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Rétablir l&apos;identité d&apos;usine
      </button>
    </section>
  );
}
