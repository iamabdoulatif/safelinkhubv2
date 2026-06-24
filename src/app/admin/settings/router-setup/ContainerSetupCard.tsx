"use client";

import { useEffect, useState, useTransition } from "react";
import { Box, Check, Copy, Loader2 } from "lucide-react";
import { provisionHotspotStack } from "@/lib/mikrotik/container-setup";
import { computeSubnetInfo, getImpactNote } from "@/lib/net/subnet";
import { VOUCHER_PROFILES } from "@/lib/mikrotik/voucher-profiles";

const PREFIX_OPTIONS = [8, 16, 19, 23, 24];
const DEFAULT_VOUCHER_PROFILE_NAMES = VOUCHER_PROFILES.map((p) => p.name);
const UNLOCK_COMMAND = "/system/device-mode/update mode=advanced container=yes";

function UnlockCommandBlock() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-md bg-amber-50 px-3 py-2.5">
      <p className="text-xs font-medium text-amber-700">
        Container verrouillé par le mode RouterOS — collez cette commande dans le terminal
        Winbox/SSH, puis confirmez en appuyant sur le bouton reset (ou en débranchant/rebranchant
        l&apos;appareil) dans les 5 minutes :
      </p>
      <div className="relative mt-1.5">
        <pre className="overflow-x-auto rounded-md bg-slate-900 px-3 py-2 pr-10 text-xs text-emerald-300">
          {UNLOCK_COMMAND}
        </pre>
        <button
          type="button"
          onClick={() => {
            try {
              navigator.clipboard?.writeText(UNLOCK_COMMAND);
            } catch {
              // non-fatal — the command stays visible to copy by hand.
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          title="Copier la commande"
          className="absolute right-1.5 top-1.5 rounded-md bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function ContainerSetupCard({
  routerId,
  defaultHasUsbStorage = false,
  supportsContainers = true,
  containerBlockedReason = null,
}: {
  routerId: string;
  defaultHasUsbStorage?: boolean;
  supportsContainers?: boolean;
  containerBlockedReason?: "architecture" | "device-mode" | null;
}) {
  const [hotspotAddress, setHotspotAddress] = useState("10.0.0.1");
  const [hotspotPrefixBits, setHotspotPrefixBits] = useState(8);
  const [hotspotName, setHotspotName] = useState("");
  const [dnsName, setDnsName] = useState("");
  const [hasUsbStorage, setHasUsbStorage] = useState(defaultHasUsbStorage);
  const [voucherProfiles, setVoucherProfiles] = useState<string[]>(DEFAULT_VOUCHER_PROFILE_NAMES);

  function toggleVoucherProfile(name: string) {
    setVoucherProfiles((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  const subnet = computeSubnetInfo(hotspotAddress.trim(), hotspotPrefixBits);

  // defaultHasUsbStorage arrives async (router detection finishes after
  // mount) — adopt it once it resolves, as long as the admin hasn't already
  // flipped the checkbox themselves.
  const [usbTouched, setUsbTouched] = useState(false);
  useEffect(() => {
    if (!usbTouched) setHasUsbStorage(defaultHasUsbStorage);
  }, [defaultHasUsbStorage, usbTouched]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success?: boolean;
    error?: string;
    log?: string[];
  } | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await provisionHotspotStack(routerId, {
        hotspotAddress,
        hotspotPrefixBits,
        hotspotName,
        dnsName,
        hasUsbStorage,
        supportsContainers,
        reboot: true,
        voucherProfiles,
      });
      setResult(res);
    });
  }

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Box className="h-5 w-5 text-slate-700" />
        <h2 className="font-semibold text-slate-900">
          Configuration automatique complète
          {supportsContainers ? " (Hotspot + MikHmon)" : " (Hotspot)"}
        </h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Construit le bridge HOTSPOT sur tous les ports LAN, le pool/DHCP/profil
        du portail captif
        {supportsContainers
          ? ", le bridge DOCKERS + conteneur MikHmon (auto-démarré), les règles NAT nécessaires,"
          : " et les règles NAT nécessaires,"}{" "}
        puis verrouille les services, l&apos;heure, l&apos;identité et le NTP
        avant de redémarrer le routeur.
        {!supportsContainers && (
          <span className="mt-1 block text-amber-600">
            Container indisponible sur cet appareil (
            {containerBlockedReason === "architecture"
              ? "architecture non compatible"
              : "fonctionnalité verrouillée par le mode RouterOS"}
            ) — l&apos;étape MikHmon est ignorée automatiquement, seul le hotspot est configuré.
          </span>
        )}
      </p>

      {containerBlockedReason === "device-mode" && <UnlockCommandBlock />}

      {result?.error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {result.error}
        </p>
      )}
      {result?.success && (
        <div className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <p className="font-medium">
            Configuration appliquée. Le routeur redémarre — patientez
            ~1 minute avant de joindre le portail.
          </p>
          {result.log && (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-emerald-600/80">
              {result.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Adresse IP du hotspot (passerelle)
          </label>
          <div className="flex gap-2">
            <input
              value={hotspotAddress}
              onChange={(e) => setHotspotAddress(e.target.value)}
              placeholder="10.0.0.1"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
            <select
              value={hotspotPrefixBits}
              onChange={(e) => setHotspotPrefixBits(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-400 focus:outline-none"
            >
              {PREFIX_OPTIONS.map((bits) => (
                <option key={bits} value={bits}>
                  /{bits}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Nom du hotspot / profil
          </label>
          <input
            value={hotspotName}
            onChange={(e) => setHotspotName(e.target.value)}
            placeholder="MIRADOR-WIFI"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Nom de domaine du portail (DNS name)
          </label>
          <input
            value={dnsName}
            onChange={(e) => setDnsName(e.target.value)}
            placeholder="mirador.ci"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        {supportsContainers && (
          <div className="flex items-end">
            <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={hasUsbStorage}
                onChange={(e) => {
                  setUsbTouched(true);
                  setHasUsbStorage(e.target.checked);
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              Le routeur a une clé USB branchée
            </label>
          </div>
        )}
      </div>

      {subnet ? (
        <div className="mt-3 rounded-md bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
          <p className="font-medium">
            {hotspotAddress.trim()}/{hotspotPrefixBits} → réseau{" "}
            {subnet.networkAddress}/{hotspotPrefixBits}, plage utilisable{" "}
            {subnet.firstUsable} – {subnet.lastUsable} ({subnet.usableHostCount.toLocaleString("fr-FR")}{" "}
            adresses, dont une réservée pour la passerelle).
          </p>
          <p className="mt-1 text-sky-700">{getImpactNote(hotspotPrefixBits)}</p>
          {hotspotPrefixBits === 8 && (
            <p className="mt-1 text-sky-700">
              Avec /8, seul le premier octet ({hotspotAddress.split(".")[0] || "x"}) compte : que
              vous choisissiez {hotspotAddress.split(".")[0] || "10"}.0.0.1 ou{" "}
              {hotspotAddress.split(".")[0] || "10"}.10.0.1 comme passerelle, c&apos;est le même
              réseau {subnet.networkAddress}/8 — seul l&apos;emplacement de la passerelle dans ce
              bloc change, pas sa taille.
            </p>
          )}
        </div>
      ) : (
        hotspotAddress.trim() && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
            Adresse IP invalide pour ce préfixe.
          </p>
        )
      )}

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Profils voucher hotspot à créer
        </label>
        <p className="mb-2 text-xs text-slate-500">
          Chaque profil coché sera créé sur le routeur avec expiration automatique des accès
          {supportsContainers && (
            <>
              {" "}
              — gérables ensuite depuis MikHmon (image{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">
                latif225/mikhmon-sf-v1:latest
              </code>
              )
            </>
          )}
          . Décochez ceux que vous ne vendez pas.
        </p>
        <div className="flex flex-wrap gap-2">
          {VOUCHER_PROFILES.map((profile) => (
            <label
              key={profile.name}
              className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                checked={voucherProfiles.includes(profile.name)}
                onChange={() => toggleVoucherProfile(profile.name)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {profile.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={pending || !hotspotAddress.trim() || !hotspotName.trim()}
        onClick={run}
        className="mt-4 flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Configuration en cours..." : "Lancer l'auto-setup complet"}
      </button>
    </div>
  );
}
