"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, Box, Check, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { provisionHotspotStack, getAutoSetupBillingStatus } from "@/lib/mikrotik/container-setup";
import { computeSubnetInfo, getImpactNote } from "@/lib/net/subnet";
import {
  VOUCHER_PROFILES,
  buildCustomDurationCode,
  buildCustomProfileLabel,
  buildCustomProfileName,
  buildVoucherProfile,
  type DurationUnit,
  type VoucherProfile,
} from "@/lib/mikrotik/voucher-profiles";
import type { DetectedRouter } from "@/lib/mikrotik/device-detect";
import DetectedModelBadge from "./DetectedModelBadge";
import TrialBadge from "@/components/billing/TrialBadge";
import PaywallCard from "@/components/billing/PaywallCard";

const DEFAULT_VOUCHER_PROFILE_NAMES = VOUCHER_PROFILES.map((p) => p.name);
const UNLOCK_COMMAND = "/system/device-mode/update mode=advanced container=yes";
const DURATION_UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "m", label: "Minutes" },
  { value: "h", label: "Heures" },
  { value: "d", label: "Jours" },
  { value: "w", label: "Semaines" },
];

/**
 * What used to be one dense "Configuration automatique complète" card
 * (DetectedModelBadge + the whole ContainerSetupCard form in a single
 * screen) is now 5 separate wizard steps sharing one piece of state, owned
 * here instead of split across components — Identité/DNS/SSID/
 * utilisateurs (detection lives here too, since the standalone Wi-Fi step
 * was dropped as a duplicate of the SSID field already on this step),
 * Stockage USB/MikHmon, Profils voucher, Portail captif, then a final
 * recap + the actual "Lancer" button. The component itself stays mounted
 * across all 5 (RouterSetupWizard just passes a different `step` value),
 * so none of this state resets when moving between them.
 */
function StepShell({
  title,
  description,
  onBack,
  onNext,
  nextLabel = "Suivant",
  nextDisabled = false,
  children,
}: {
  title: string;
  description?: string;
  onBack: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}

      <div className="mt-4">{children}</div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Précédent
        </button>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}

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

export default function AutoSetupSteps({
  step,
  onStepChange,
  routerId,
  hotspotBridge,
}: {
  step: 3 | 4 | 5 | 6 | 7;
  onStepChange: (step: 2 | 3 | 4 | 5 | 6 | 7 | 8) => void;
  routerId: string;
  hotspotBridge: { gatewayIp: string; subnetBits: number } | null;
}) {
  const [detected, setDetected] = useState<DetectedRouter | null>(null);

  type BillingStatus = {
    isFree: boolean;
    alreadyBilled: boolean;
    feeCents: number;
    walletBalanceCents: number;
    sufficientBalance: boolean;
  };
  const [billing, setBilling] = useState<BillingStatus | null>(null);

  const archSupportsContainers = detected?.supportsContainers ?? true;
  const containerReady =
    detected === null
      ? true
      : detected.supportsContainers && detected.containerFeatureEnabled !== false;
  const containerBlockedReason: "architecture" | "device-mode" | null =
    detected === null || containerReady
      ? null
      : !detected.supportsContainers
        ? "architecture"
        : "device-mode";
  const requiresUsbForContainer = detected?.requiresUsbForContainer ?? false;

  const hotspotAddress = hotspotBridge?.gatewayIp ?? "";
  const hotspotPrefixBits = hotspotBridge?.subnetBits ?? 24;

  const [hotspotName, setHotspotName] = useState("");
  const [identity, setIdentity] = useState("");
  const [dnsName, setDnsName] = useState("");
  const [ssid, setSsid] = useState("");
  const [defaultHotspotUsers, setDefaultHotspotUsers] = useState("");
  const [hasUsbStorage, setHasUsbStorage] = useState(false);
  const [usbTouched, setUsbTouched] = useState(false);
  const [voucherProfiles, setVoucherProfiles] = useState<string[]>(DEFAULT_VOUCHER_PROFILE_NAMES);
  const [customProfiles, setCustomProfiles] = useState<VoucherProfile[]>([]);
  const [customAmount, setCustomAmount] = useState("2");
  const [customUnit, setCustomUnit] = useState<DurationUnit>("d");
  const [customPrice, setCustomPrice] = useState("");
  const [customProfileError, setCustomProfileError] = useState<string | null>(null);
  const [installCaptivePortal, setInstallCaptivePortal] = useState(true);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string; log?: string[] } | null>(
    null,
  );

  // defaultHasUsbStorage from detection arrives after mount — adopt it
  // once available, as long as the admin hasn't already flipped the
  // checkbox themselves.
  const detectedHasUsb = detected?.hasUsbStorage ?? false;
  const [prevDetectedHasUsb, setPrevDetectedHasUsb] = useState(detectedHasUsb);
  if (detectedHasUsb !== prevDetectedHasUsb) {
    setPrevDetectedHasUsb(detectedHasUsb);
    if (!usbTouched) setHasUsbStorage(detectedHasUsb);
  }

  function toggleVoucherProfile(name: string) {
    setVoucherProfiles((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function addCustomProfile() {
    const amount = Number(customAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setCustomProfileError("Indiquez une durée entière supérieure à 0.");
      return;
    }
    const price = customPrice.trim() === "" ? 0 : Number(customPrice);
    if (!Number.isInteger(price) || price < 0) {
      setCustomProfileError("Indiquez un prix entier (FCFA) supérieur ou égal à 0.");
      return;
    }
    const name = buildCustomProfileName(amount, customUnit);
    if (VOUCHER_PROFILES.some((p) => p.name === name) || customProfiles.some((p) => p.name === name)) {
      setCustomProfileError(`Un profil "${name}" existe déjà.`);
      return;
    }
    setCustomProfileError(null);
    const baseLabel = buildCustomProfileLabel(amount, customUnit);
    const profile = buildVoucherProfile({
      name,
      label: price > 0 ? `${baseLabel} — ${price.toLocaleString("fr-FR")} FCFA` : baseLabel,
      durationCode: buildCustomDurationCode(amount, customUnit),
      price,
    });
    setCustomProfiles((prev) => [...prev, profile]);
    setCustomPrice("");
  }

  function removeCustomProfile(name: string) {
    setCustomProfiles((prev) => prev.filter((p) => p.name !== name));
  }

  const subnet = hotspotBridge ? computeSubnetInfo(hotspotAddress.trim(), hotspotPrefixBits) : null;

  // Pricing depends on the board's architecture (full Hotspot+MikHmon vs
  // hotspot-only — see autoSetupFeeCentsFor), known only once detection
  // resolves in step 3, so this can't be fetched any earlier. Re-fetches
  // whenever that resolves, which is also exactly when the fee tier could
  // change (e.g. a flaky first read defaulting to true).
  useEffect(() => {
    if (detected === null) return;
    let cancelled = false;
    getAutoSetupBillingStatus(routerId, detected.supportsContainers).then((res) => {
      if (cancelled) return;
      if (res?.success) {
        setBilling({
          isFree: res.isFree,
          alreadyBilled: res.alreadyBilled,
          feeCents: res.feeCents,
          walletBalanceCents: res.walletBalanceCents,
          sufficientBalance: res.sufficientBalance,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [detected, routerId]);

  function run() {
    setResult(null);
    startTransition(async () => {
      const selectedPresets = VOUCHER_PROFILES.filter((p) => voucherProfiles.includes(p.name));
      const res = await provisionHotspotStack(routerId, {
        hotspotAddress,
        hotspotPrefixBits,
        hotspotName,
        identity: identity.trim() || undefined,
        dnsName,
        ssid: ssid.trim() || undefined,
        defaultHotspotUsers: defaultHotspotUsers
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean),
        hasUsbStorage,
        supportsContainers: archSupportsContainers,
        reboot: true,
        voucherProfiles: [...selectedPresets, ...customProfiles],
        installCaptivePortal,
      });
      setResult(res);
    });
  }

  if (step === 3) {
    return (
      <StepShell
        title="Étape 3 : Identité, domaine & utilisateurs"
        description="Détection du modèle du routeur, puis les valeurs qui identifient le hotspot et le portail captif — le nom du réseau Wi-Fi (SSID) se règle ici, il sera appliqué au lancement de l'auto-setup."
        onBack={() => onStepChange(2)}
        onNext={() => onStepChange(4)}
        nextDisabled={!hotspotName.trim()}
      >
        <div className="mb-2">
          <DetectedModelBadge routerId={routerId} onDetected={setDetected} />
        </div>

        {!hotspotBridge ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Configurez d&apos;abord un bridge hotspot à l&apos;Étape 2 (Topologie réseau) — son
            adresse IP de passerelle sera réutilisée ici automatiquement.
          </p>
        ) : (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Adresse IP du hotspot (passerelle) :{" "}
            <span className="font-medium text-slate-800">
              {hotspotAddress}/{hotspotPrefixBits}
            </span>{" "}
            — héritée du bridge configuré à l&apos;Étape 2.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Identité système (/system identity)
            </label>
            <input
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder={
                hotspotName.trim()
                  ? `HSPT-${hotspotName.split(/[\s-]/)[0].toUpperCase()}`
                  : "HSPT-MIRADOR"
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Laissez vide pour générer automatiquement à partir du nom du hotspot.
            </p>
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
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Nom du réseau WiFi (SSID)
            </label>
            <input
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="MIRADOR WIFI"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Utilisateurs hotspot par défaut (optionnel)
            </label>
            <input
              value={defaultHotspotUsers}
              onChange={(e) => setDefaultHotspotUsers(e.target.value)}
              placeholder="admin, president01@"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Séparés par des virgules, sans mot de passe. Laissez vide si vous gérez les accès
              via les profils voucher.
            </p>
          </div>
        </div>

        {subnet ? (
          <div className="mt-3 rounded-md bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
            <p className="font-medium">
              {hotspotAddress.trim()}/{hotspotPrefixBits} → réseau {subnet.networkAddress}/
              {hotspotPrefixBits}, plage utilisable {subnet.firstUsable} – {subnet.lastUsable} (
              {subnet.usableHostCount.toLocaleString("fr-FR")} adresses, dont une réservée pour la
              passerelle).
            </p>
            <p className="mt-1 text-sky-700">{getImpactNote(hotspotPrefixBits)}</p>
          </div>
        ) : (
          hotspotAddress.trim() && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
              Adresse IP invalide pour ce préfixe.
            </p>
          )
        )}
      </StepShell>
    );
  }

  if (step === 4) {
    return (
      <StepShell
        title="Étape 4 : Stockage USB & MikHmon"
        description="MikHmon (gestion des vouchers) tourne dans un conteneur RouterOS — certains modèles ont besoin d'une clé USB pour ça."
        onBack={() => onStepChange(3)}
        onNext={() => onStepChange(5)}
      >
        {!archSupportsContainers && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Container indisponible sur cet appareil (architecture non compatible) —
            l&apos;étape MikHmon sera automatiquement ignorée, seul le hotspot sera configuré.
          </p>
        )}

        {archSupportsContainers && containerBlockedReason === "device-mode" && (
          <>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Container verrouillé par le mode RouterOS sur cet appareil.
            </p>
            <UnlockCommandBlock />
          </>
        )}

        {archSupportsContainers && (
          <label className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
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
        )}

        {archSupportsContainers && requiresUsbForContainer && !hasUsbStorage && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Ce modèle n&apos;a pas assez de mémoire flash interne pour installer MikHmon sans clé
            USB — branchez une clé USB sur le routeur puis cochez la case ci-dessus avant de
            lancer la configuration, sous peine d&apos;échec ou de saturation de la flash.
          </p>
        )}
      </StepShell>
    );
  }

  if (step === 5) {
    return (
      <StepShell
        title="Étape 5 : Profils voucher"
        description="Chaque profil coché sera créé sur le routeur avec expiration automatique des accès."
        onBack={() => onStepChange(4)}
        onNext={() => onStepChange(6)}
      >
        <p className="text-xs text-slate-500">
          Gérables ensuite depuis MikHmon (image{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">latif225/mikhmon-sf-v1:latest</code>
          ). Décochez ceux que vous ne vendez pas.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
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
          {customProfiles.map((profile) => (
            <span
              key={profile.name}
              className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700"
            >
              {profile.label}
              <button
                type="button"
                onClick={() => removeCustomProfile(profile.name)}
                title="Retirer ce profil"
                className="text-emerald-500 hover:text-emerald-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              Créer un profil personnalisé
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as DurationUnit)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
              >
                {DURATION_UNIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              Prix (FCFA)
            </label>
            <input
              type="number"
              min={0}
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder="0"
              className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={addCustomProfile}
            className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter ce profil
          </button>
        </div>
        {customProfileError && <p className="mt-1.5 text-xs text-red-600">{customProfileError}</p>}
      </StepShell>
    );
  }

  if (step === 6) {
    return (
      <StepShell
        title="Étape 6 : Portail captif"
        description="La page que vos clients voient en se connectant au Wi-Fi — installée dans ce même script d'automatisation."
        onBack={() => onStepChange(5)}
        onNext={() => onStepChange(7)}
      >
        <label className="flex items-center gap-3 rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={installCaptivePortal}
            onChange={(e) => setInstallCaptivePortal(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block font-medium">Installer automatiquement le portail captif SafeLinkHub</span>
            <span className="mt-0.5 block text-xs text-slate-400">
              Remplace la page de connexion par défaut RouterOS par le portail SafeLinkHub
              (logo, plans, paiement mobile money, vendeurs agréés). Réutilise vos coordonnées
              déjà personnalisées si vous en avez (page Modèles de portail captif), sinon installe
              le modèle par défaut.
            </span>
          </span>
        </label>

        {!installCaptivePortal && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            La page de connexion par défaut de RouterOS sera conservée. Vous pourrez installer le
            portail captif SafeLinkHub plus tard depuis{" "}
            <span className="font-medium">Modèles de portail captif</span>.
          </p>
        )}
      </StepShell>
    );
  }

  // step === 7
  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-slate-700" />
          <h2 className="font-semibold text-slate-900">
            Étape 7 : Récapitulatif & lancement
            {archSupportsContainers ? " (Hotspot + MikHmon)" : " (Hotspot)"}
          </h2>
        </div>
        {billing && (billing.isFree || billing.alreadyBilled) && (
          <TrialBadge
            active
            activeLabel={billing.alreadyBilled ? "Déjà configuré" : "1er routeur gratuit"}
          />
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Construit le bridge HOTSPOT sur tous les ports LAN, le pool/DHCP/profil du portail
        captif, installe le portail captif SafeLinkHub
        {archSupportsContainers
          ? ", le bridge DOCKERS + conteneur MikHmon (auto-démarré), les règles NAT nécessaires,"
          : " et les règles NAT nécessaires,"}{" "}
        puis verrouille les services, l&apos;heure, l&apos;identité et le NTP avant de redémarrer
        le routeur.
      </p>

      {billing && !billing.isFree && !billing.alreadyBilled && (
        <div className="mt-4">
          <PaywallCard
            title="Configuration automatique payante"
            description={
              archSupportsContainers
                ? "Routeur compatible Container (Hotspot + MikHmon) — tarif plein."
                : "Routeur sans support Container (Hotspot seul) — tarif réduit."
            }
            feeCents={billing.feeCents}
            walletBalanceCents={billing.walletBalanceCents}
            sufficientBalance={billing.sufficientBalance}
          />
        </div>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-slate-400">Adresse IP hotspot</dt>
          <dd className="font-medium text-slate-700">
            {hotspotBridge ? `${hotspotAddress}/${hotspotPrefixBits}` : "— (à configurer)"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Nom du hotspot</dt>
          <dd className="font-medium text-slate-700">{hotspotName || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Identité système</dt>
          <dd className="font-medium text-slate-700">{identity || "(auto)"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Domaine du portail</dt>
          <dd className="font-medium text-slate-700">{dnsName || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">SSID Wi-Fi</dt>
          <dd className="font-medium text-slate-700">{ssid || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Clé USB</dt>
          <dd className="font-medium text-slate-700">{hasUsbStorage ? "Oui" : "Non"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Portail captif</dt>
          <dd className="font-medium text-slate-700">
            {installCaptivePortal ? "SafeLinkHub (auto)" : "Page par défaut RouterOS"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-400">Profils voucher ({voucherProfiles.length + customProfiles.length})</dt>
          <dd className="font-medium text-slate-700">
            {[...VOUCHER_PROFILES.filter((p) => voucherProfiles.includes(p.name)), ...customProfiles]
              .map((p) => p.label)
              .join(", ") || "Aucun"}
          </dd>
        </div>
      </dl>

      {result?.error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{result.error}</p>
      )}
      {result?.success && (
        <div className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <p className="font-medium">
            Configuration appliquée. Le routeur redémarre — patientez ~1 minute avant de joindre
            le portail.
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

      <button
        type="button"
        disabled={
          pending ||
          !hotspotBridge ||
          !hotspotName.trim() ||
          (archSupportsContainers && requiresUsbForContainer && !hasUsbStorage) ||
          (billing !== null && !billing.sufficientBalance)
        }
        onClick={run}
        className="mt-4 flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Configuration en cours..." : "Lancer l'auto-setup complet"}
      </button>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onStepChange(6)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Précédent
        </button>
        <button
          type="button"
          onClick={() => onStepChange(8)}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Suivant : Tester la connexion
        </button>
      </div>
    </div>
  );
}
