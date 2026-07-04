"use client";

/**
 * Étape 3 unique : configuration automatique complète. Remplace les
 * anciennes étapes 3 à 9 (Domaine/Wi-Fi, USB/MikHmon, Profils, Portail,
 * Récap, Test, Aperçu) par un seul écran où tout est pré-configuré :
 *
 * - SSID et domaine dérivés automatiquement du nom du hotspot (modifiables) ;
 * - MikHmon inclus automatiquement quand le matériel le permet, clé USB
 *   pré-détectée, avertissements uniquement quand ils s'appliquent ;
 * - profils voucher pré-remplis depuis les forfaits actifs de la page
 *   Forfaits (les nouveaux créés ici y sont synchronisés en retour) ;
 * - portail captif installé par défaut avec le modèle par défaut ;
 * - la vérification post-setup (ConfigAuditBanner) s'affiche dans le même
 *   écran après le lancement — plus d'étapes de test séparées.
 */

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Box, Check, Copy, Plus, Trash2 } from "lucide-react";
import { provisionHotspotStack, getAutoSetupBillingStatus } from "@/lib/mikrotik/container-setup";
import { listCaptiveTemplates } from "@/lib/captive-templates/actions";
import { listActivePackages } from "@/lib/packages/actions";
import FancyLoader from "@/components/FancyLoader";
import {
  classForPrefix,
  CLASS_DEFAULT_PREFIX,
  CLASS_PREFIX_OPTIONS,
  computeSubnetInfo,
  GATEWAY_IP_PRESETS,
  getImpactNote,
  type NetworkClass,
} from "@/lib/net/subnet";
import {
  buildCustomDurationCode,
  buildCustomProfileLabel,
  buildCustomProfileName,
  buildVoucherProfile,
  type DurationUnit,
  type VoucherProfile,
} from "@/lib/mikrotik/voucher-profiles";
import { detectRouterModel, type DetectedRouter } from "@/lib/mikrotik/device-detect";
import DetectedModelBadge from "./DetectedModelBadge";
import ConfigAuditBanner from "./ConfigAuditBanner";
import TrialBadge from "@/components/billing/TrialBadge";
import PaywallCard from "@/components/billing/PaywallCard";

const UNLOCK_COMMAND =
  "/system/device-mode/update mode=advanced container=yes hotspot=yes scheduler=yes fetch=yes activation-timeout=10m";

const DURATION_UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "m", label: "Minutes" },
  { value: "h", label: "Heures" },
  { value: "d", label: "Jours" },
  { value: "w", label: "Semaines" },
  { value: "mo", label: "Mois" },
];

// Correspondance bidirectionnelle avec les unités des Forfaits
// (/admin/packages, voir CreatePackageModal.tsx).
const PACKAGE_DURATION_UNIT: Record<DurationUnit, string> = {
  m: "Minutes",
  h: "Hours",
  d: "Days",
  w: "Weeks",
  mo: "Months",
};
const DURATION_UNIT_FROM_PACKAGE: Record<string, DurationUnit> = {
  Minutes: "m",
  Hours: "h",
  Days: "d",
  Weeks: "w",
  Months: "mo",
};

function slugifyDomain(input: string) {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function UnlockCommandBlock() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-md bg-clay px-3 py-2.5">
      <p className="text-xs font-medium text-warn">
        Container verrouillé par le mode RouterOS — collez cette commande dans le terminal
        Winbox/SSH, puis confirmez en appuyant sur le bouton reset/mode (ou en
        débranchant/rebranchant l&apos;appareil) dans les 10 minutes :
      </p>
      <div className="relative mt-1.5">
        <pre className="code-block px-3 py-2 pr-10">{UNLOCK_COMMAND}</pre>
        <button
          type="button"
          onClick={() => {
            try {
              navigator.clipboard?.writeText(UNLOCK_COMMAND);
            } catch {
              // non-fatal — la commande reste visible pour copie manuelle.
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          title="Copier la commande"
          className="absolute right-1.5 top-1.5 rounded-md bg-[#3A362F] p-1.5 text-white hover:bg-[#3A362F]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function AutoSetupStep({
  onBack,
  routerId,
  hotspotBridge,
  savedHotspotNames,
}: {
  onBack: () => void;
  routerId: string;
  hotspotBridge: { gatewayIp: string; subnetBits: number } | null;
  savedHotspotNames: { serverName: string | null };
}) {
  const [detected, setDetected] = useState<DetectedRouter | null>(null);

  type BillingStatus = {
    isFree: boolean;
    alreadyBilled: boolean;
    feeCents: number;
    walletBalanceCents: number;
    sufficientBalance: boolean;
    unlimited?: boolean;
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
  const [revalidating, setRevalidating] = useState(false);

  function revalidateDetection() {
    setRevalidating(true);
    detectRouterModel(routerId).then((res) => {
      setRevalidating(false);
      if (res?.detected) setDetected(res.detected);
    });
  }

  // Le déverrouillage Container exige une confirmation physique côté
  // routeur — on re-vérifie automatiquement toutes les 15 s tant que le
  // blocage est visible, pour que l'écran se débloque tout seul.
  useEffect(() => {
    if (containerBlockedReason !== "device-mode") return;
    const interval = window.setInterval(() => {
      detectRouterModel(routerId).then((res) => {
        if (res?.detected) setDetected(res.detected);
      });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [containerBlockedReason, routerId]);

  // ── Réseau du hotspot : pré-rempli depuis le bridge de l'Étape 2, mais
  // modifiable ici via les mêmes sélecteurs (IP de passerelle, classe
  // réseau, taille du sous-réseau /8→/24) que le configurateur de bridge —
  // une seule source de vérité, resynchronisée en DB au lancement.
  const savedPrefixBits = hotspotBridge?.subnetBits ?? 24;
  const initialClass = classForPrefix(savedPrefixBits);
  const [hotspotAddress, setHotspotAddress] = useState(
    hotspotBridge?.gatewayIp && hotspotBridge.gatewayIp !== "Not configured"
      ? hotspotBridge.gatewayIp
      : GATEWAY_IP_PRESETS[0],
  );
  const [networkClass, setNetworkClass] = useState<NetworkClass>(initialClass);
  const [hotspotPrefixBits, setHotspotPrefixBits] = useState(
    CLASS_PREFIX_OPTIONS[initialClass].includes(savedPrefixBits)
      ? savedPrefixBits
      : CLASS_DEFAULT_PREFIX[initialClass],
  );

  function changeNetworkClass(next: NetworkClass) {
    setNetworkClass(next);
    if (!CLASS_PREFIX_OPTIONS[next].includes(hotspotPrefixBits)) {
      setHotspotPrefixBits(CLASS_DEFAULT_PREFIX[next]);
    }
  }

  // L'IP courante peut venir d'un bridge saisi à la main — on la garde
  // dans le sélecteur même si elle n'est pas dans les presets partagés.
  const gatewayOptions = GATEWAY_IP_PRESETS.includes(
    hotspotAddress as (typeof GATEWAY_IP_PRESETS)[number],
  )
    ? [...GATEWAY_IP_PRESETS]
    : [hotspotAddress, ...GATEWAY_IP_PRESETS];

  // ── Essentiels : un seul champ obligatoire, le reste est dérivé ──────
  const [hotspotName, setHotspotName] = useState("");
  const [ssid, setSsid] = useState("");
  const [ssidTouched, setSsidTouched] = useState(false);
  const [dnsName, setDnsName] = useState("");
  const [dnsTouched, setDnsTouched] = useState(false);

  function onHotspotNameChange(value: string) {
    setHotspotName(value);
    if (!ssidTouched) setSsid(value);
    if (!dnsTouched) {
      const slug = slugifyDomain(value);
      setDnsName(slug ? `${slug}.wifi` : "");
    }
  }

  const [hasUsbStorage, setHasUsbStorage] = useState(false);
  const [usbTouched, setUsbTouched] = useState(false);
  const [skipMikhmon, setSkipMikhmon] = useState(false);
  const [installCaptivePortal, setInstallCaptivePortal] = useState(true);
  const [packageTemplates, setPackageTemplates] = useState<
    { id: string; name: string; isDefault: boolean }[]
  >([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // ── Profils voucher : pré-remplis depuis les forfaits actifs ─────────
  const [customProfiles, setCustomProfiles] = useState<VoucherProfile[]>([]);
  // Seuls les profils créés ici (pas les importés) sont resynchronisés
  // comme forfaits, pour ne pas dupliquer ceux qui existent déjà.
  const [customProfileMeta, setCustomProfileMeta] = useState<
    { name: string; priceCents: number; durationValue: number; durationUnit: string }[]
  >([]);
  const [customAmount, setCustomAmount] = useState("2");
  const [customUnit, setCustomUnit] = useState<DurationUnit>("d");
  const [customPrice, setCustomPrice] = useState("");
  const [customProfileError, setCustomProfileError] = useState<string | null>(null);

  useEffect(() => {
    listCaptiveTemplates().then((rows) => {
      const templates = rows
        .filter((r) => r.templateType === "package")
        .map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault }));
      setPackageTemplates(templates);
      const preselected = templates.find((t) => t.isDefault) ?? templates[0];
      if (preselected) setSelectedTemplateId(preselected.id);
    });
    listActivePackages().then((pkgs) => {
      const imported: VoucherProfile[] = [];
      for (const pkg of pkgs) {
        const unit = DURATION_UNIT_FROM_PACKAGE[pkg.durationUnit];
        if (!unit) continue;
        const name = buildCustomProfileName(pkg.durationValue, unit);
        if (imported.some((p) => p.name === name)) continue;
        imported.push(
          buildVoucherProfile({
            name,
            label:
              pkg.priceCents > 0
                ? `${buildCustomProfileLabel(pkg.durationValue, unit)} — ${pkg.priceCents.toLocaleString("fr-FR")} FCFA`
                : buildCustomProfileLabel(pkg.durationValue, unit),
            durationCode: buildCustomDurationCode(pkg.durationValue, unit),
            price: pkg.priceCents,
          }),
        );
      }
      if (imported.length > 0) {
        setCustomProfiles((prev) => {
          const existing = new Set(prev.map((p) => p.name));
          return [...prev, ...imported.filter((p) => !existing.has(p.name))];
        });
      }
    });
  }, []);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success?: boolean;
    error?: string;
    log?: string[];
    firmwareUpdating?: boolean;
    message?: string;
  } | null>(null);

  // La détection USB arrive après le montage — on l'adopte tant que
  // l'admin n'a pas touché la case lui-même.
  const detectedHasUsb = detected?.hasUsbStorage ?? false;
  const [prevDetectedHasUsb, setPrevDetectedHasUsb] = useState(detectedHasUsb);
  if (detectedHasUsb !== prevDetectedHasUsb) {
    setPrevDetectedHasUsb(detectedHasUsb);
    if (!usbTouched) setHasUsbStorage(detectedHasUsb);
  }

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
    if (customProfiles.some((p) => p.name === name)) {
      setCustomProfileError(`Un profil "${name}" existe déjà.`);
      return;
    }
    setCustomProfileError(null);
    const baseLabel = buildCustomProfileLabel(amount, customUnit);
    setCustomProfiles((prev) => [
      ...prev,
      buildVoucherProfile({
        name,
        label: price > 0 ? `${baseLabel} — ${price.toLocaleString("fr-FR")} FCFA` : baseLabel,
        durationCode: buildCustomDurationCode(amount, customUnit),
        price,
      }),
    ]);
    setCustomProfileMeta((prev) => [
      ...prev,
      { name, priceCents: price, durationValue: amount, durationUnit: PACKAGE_DURATION_UNIT[customUnit] },
    ]);
    setCustomPrice("");
  }

  function removeCustomProfile(name: string) {
    setCustomProfiles((prev) => prev.filter((p) => p.name !== name));
    setCustomProfileMeta((prev) => prev.filter((p) => p.name !== name));
  }

  const subnet = computeSubnetInfo(hotspotAddress.trim(), hotspotPrefixBits);

  const mikhmonIncluded = archSupportsContainers && !skipMikhmon;

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await provisionHotspotStack(routerId, {
        hotspotAddress,
        hotspotPrefixBits,
        hotspotName,
        dnsName,
        ssid: ssid.trim() || undefined,
        defaultHotspotUsers: [],
        hasUsbStorage,
        hasLargeOnboardStorage: detected?.hasLargeOnboardStorage ?? false,
        supportsContainers: mikhmonIncluded,
        reboot: true,
        voucherProfiles: customProfiles,
        packagesToSync: customProfileMeta,
        installCaptivePortal,
        captiveTemplateId: installCaptivePortal ? (selectedTemplateId ?? undefined) : undefined,
        serverName: savedHotspotNames.serverName ?? undefined,
      });
      setResult(res);
    });
  }

  const launchBlocked =
    pending ||
    !hotspotBridge ||
    !subnet ||
    !hotspotName.trim() ||
    (mikhmonIncluded && requiresUsbForContainer && !hasUsbStorage) ||
    (mikhmonIncluded && containerBlockedReason === "device-mode") ||
    (billing !== null && !billing.sufficientBalance);

  return (
    // L'animation d'entrée (slide/fondu) est portée par le wrapper d'étape
    // du RouterSetupWizard pour suivre la direction de navigation.
    <div className="mt-6 sm:mt-8 border-2 border-line bg-paper p-4 sm:p-6">
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="h-5 w-5 shrink-0 text-ink" />
          <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-ink">
            Étape 3 : Auto-config
            <span className="hidden sm:inline"> {mikhmonIncluded ? "(Hotspot + MikHmon)" : "(Hotspot)"}</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {billing?.unlimited ? (
            <TrialBadge active activeLabel="Compte illimité — Superadmin" />
          ) : (
            billing &&
            (billing.isFree || billing.alreadyBilled) && (
              <TrialBadge
                active
                activeLabel={billing.alreadyBilled ? "Déjà configuré" : "1er routeur gratuit"}
              />
            )
          )}
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft max-w-3xl">
        Tout est pré-configuré : donnez un nom à votre hotspot, vérifiez le récapitulatif et
        lancez. Le script construit le hotspot, le portail captif, les profils voucher
        {mikhmonIncluded ? ", MikHmon" : ""} et les règles NAT, puis redémarre le routeur.
      </p>

      <div className="mt-4">
        <DetectedModelBadge routerId={routerId} onDetected={setDetected} />
      </div>

      {!hotspotBridge && (
        <p className="mt-3 rounded-md bg-clay px-3 py-2 text-sm text-warn">
          Configurez d&apos;abord un bridge hotspot à l&apos;Étape 2 (Topologie réseau) — ses
          ports seront réutilisés ici, et le réseau choisi ci-dessous y sera resynchronisé.
        </p>
      )}

      {/* ── Réseau du hotspot (passerelle, classe, sous-réseau) ───────── */}
      <div className="mt-4 rounded-md border border-line-soft p-4">
        <p className="text-sm font-medium text-ink">Réseau du hotspot</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Pré-rempli depuis l&apos;Étape 2 — même sélecteur que le configurateur de bridge,
          appliqué au routeur et resynchronisé sur la topologie au lancement.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="as-gateway-ip" className="mb-1 block text-xs font-medium text-ink-soft">
              IP de la passerelle
            </label>
            <select
              id="as-gateway-ip"
              value={hotspotAddress}
              onChange={(e) => setHotspotAddress(e.target.value)}
              className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
            >
              {gatewayOptions.map((ip) => (
                <option key={ip} value={ip}>
                  {ip}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="as-network-class" className="mb-1 block text-xs font-medium text-ink-soft">
              Classe réseau
            </label>
            <select
              id="as-network-class"
              value={networkClass}
              onChange={(e) => changeNetworkClass(e.target.value as NetworkClass)}
              className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
            >
              {(["any", "A", "B", "C"] as NetworkClass[]).map((c) => (
                <option key={c} value={c}>
                  {c === "any" ? "Toutes" : `Classe ${c}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="as-subnet-bits" className="mb-1 block text-xs font-medium text-ink-soft">
              Taille du sous-réseau
            </label>
            <select
              id="as-subnet-bits"
              value={hotspotPrefixBits}
              onChange={(e) => setHotspotPrefixBits(Number(e.target.value))}
              className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
            >
              {CLASS_PREFIX_OPTIONS[networkClass].map((bits) => (
                <option key={bits} value={bits}>
                  /{bits}
                </option>
              ))}
            </select>
          </div>
        </div>
        {subnet && (
          <p className="mt-2 rounded-md bg-clay px-3 py-2 text-xs text-ink-soft">
            Réseau hotspot : <span className="font-medium text-ink">{hotspotAddress}/{hotspotPrefixBits}</span>{" "}
            — {getImpactNote(hotspotPrefixBits)}
          </p>
        )}
      </div>

      {/* ── Identité du hotspot ─────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="as-hotspot-name" className="mb-1 block text-xs font-medium text-ink-soft">
            Nom du hotspot
          </label>
          <input
            id="as-hotspot-name"
            value={hotspotName}
            onChange={(e) => onHotspotNameChange(e.target.value)}
            placeholder="MIRADOR-WIFI"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="as-ssid" className="mb-1 block text-xs font-medium text-ink-soft">
            Nom du réseau Wi-Fi (SSID)
          </label>
          <input
            id="as-ssid"
            value={ssid}
            onChange={(e) => {
              setSsidTouched(true);
              setSsid(e.target.value);
            }}
            placeholder="Identique au nom du hotspot"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="as-dns" className="mb-1 block text-xs font-medium text-ink-soft">
            Domaine du portail
          </label>
          <input
            id="as-dns"
            value={dnsName}
            onChange={(e) => {
              setDnsTouched(true);
              setDnsName(e.target.value);
            }}
            placeholder="mirador.wifi"
            className="w-full rounded-md border border-line-soft px-3 py-2 text-sm focus:border-line-soft focus:outline-none"
          />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-soft">
        SSID et domaine se remplissent automatiquement depuis le nom du hotspot — modifiez-les
        seulement si besoin.
      </p>

      {/* ── MikHmon : décision automatique, avertissements ciblés ────── */}
      {containerBlockedReason === "architecture" && (
        <p className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-warn">
          Container indisponible sur cet appareil (architecture non compatible) — MikHmon sera
          ignoré, seul le hotspot sera configuré.
        </p>
      )}

      {archSupportsContainers && containerBlockedReason === "device-mode" && !skipMikhmon && (
        <div className="mt-4">
          <p className="flex items-center justify-between gap-2 rounded-md bg-clay px-3 py-2 text-sm text-warn">
            <span>Container verrouillé par le mode RouterOS sur cet appareil.</span>
            <button
              type="button"
              onClick={revalidateDetection}
              disabled={revalidating}
              className="shrink-0 rounded-md border border-warn px-2 py-1 text-xs font-medium text-warn hover:bg-clay disabled:opacity-50"
            >
              {revalidating ? "Vérification…" : "Relancer la vérification"}
            </button>
          </p>
          <p className="mt-1.5 text-xs text-warn">
            La commande seule ne suffit pas — confirmez aussi physiquement (bouton reset, ou
            débrancher/rebrancher) dans les 10 minutes. Re-vérification automatique toutes les
            15 s. Le lancement reste bloqué tant que ce n&apos;est pas confirmé — ou cochez
            « Ignorer MikHmon » ci-dessous pour configurer le hotspot sans attendre.
          </p>
          <UnlockCommandBlock />
        </div>
      )}

      {archSupportsContainers && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-line-soft px-3 py-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={skipMikhmon}
              onChange={(e) => setSkipMikhmon(e.target.checked)}
              className="h-4 w-4 rounded border-line-soft"
            />
            Ignorer MikHmon pour cette installation
          </label>
          {!skipMikhmon && (
            <label className="flex items-center gap-2 rounded-md border border-line-soft px-3 py-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={hasUsbStorage}
                onChange={(e) => {
                  setUsbTouched(true);
                  setHasUsbStorage(e.target.checked);
                }}
                className="h-4 w-4 rounded border-line-soft"
              />
              Le routeur a une clé USB branchée
              {detected?.hasUsbStorage && !usbTouched && (
                <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-ok">
                  détectée
                </span>
              )}
            </label>
          )}
        </div>
      )}

      {mikhmonIncluded && requiresUsbForContainer && !hasUsbStorage && (
        <p className="mt-2 rounded-md bg-clay px-3 py-2 text-xs text-warn">
          Ce modèle a besoin d&apos;une clé USB pour MikHmon (flash interne insuffisante) —
          branchez-en une et cochez la case, ou cochez « Ignorer MikHmon ».
        </p>
      )}

      {/* ── Profils voucher (pré-remplis depuis les Forfaits) ─────────── */}
      <div className="mt-5 rounded-md border border-line-soft p-4">
        <p className="text-sm font-medium text-ink">Profils voucher</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Pré-remplis depuis vos forfaits actifs — chaque profil est créé sur le routeur avec
          expiration automatique, et les nouveaux sont synchronisés sur la page Forfaits.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {customProfiles.length === 0 && (
            <p className="text-xs text-ink-soft">
              Aucun profil — créez-en au moins un ci-dessous (ex : 1 jour, 500 FCFA).
            </p>
          )}
          {customProfiles.map((profile) => (
            <span
              key={profile.name}
              className="flex items-center gap-1.5 rounded-md border border-ok bg-clay px-3 py-1.5 text-sm text-ok"
            >
              {profile.label}
              <button
                type="button"
                onClick={() => removeCustomProfile(profile.name)}
                title="Retirer ce profil"
                aria-label={`Retirer le profil ${profile.label}`}
                className="text-ok hover:text-ok"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-ink-soft">Durée</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                aria-label="Durée du profil"
                className="w-20 rounded-md border border-line-soft px-2 py-1.5 text-sm focus:border-line-soft focus:outline-none"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as DurationUnit)}
                aria-label="Unité de durée"
                className="rounded-md border border-line-soft px-2 py-1.5 text-sm focus:border-line-soft focus:outline-none"
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
            <label className="mb-1 block text-[11px] font-medium text-ink-soft">Prix (FCFA)</label>
            <input
              type="number"
              min={0}
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder="0"
              className="w-24 rounded-md border border-line-soft px-2 py-1.5 text-sm focus:border-line-soft focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={addCustomProfile}
            className="flex items-center gap-1 rounded-md border border-line-soft px-3 py-1.5 text-sm font-medium text-ink hover:bg-clay"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>
        {customProfileError && <p className="mt-1.5 text-xs text-err">{customProfileError}</p>}
      </div>

      {/* ── Portail captif ────────────────────────────────────────────── */}
      <div className="mt-4 rounded-md border border-line-soft p-4">
        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={installCaptivePortal}
            onChange={(e) => setInstallCaptivePortal(e.target.checked)}
            className="h-4 w-4 rounded border-line-soft"
          />
          <span>
            <span className="block font-medium">Installer le portail captif SafeLinkHub</span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              Remplace la page de connexion RouterOS par le portail SafeLinkHub (plans, paiement
              mobile money, vendeurs agréés).
            </span>
          </span>
        </label>
        {installCaptivePortal && packageTemplates.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-line-soft pt-3">
            <p className="text-xs text-ink-soft">
              Choisissez le portail à installer — importez les vôtres depuis{" "}
              <Link
                href={`/admin/settings/captive-templates?retour=${routerId}`}
                className="underline"
              >
                Paramètres → Portail captif
              </Link>
              .
            </p>
            {packageTemplates.map((tpl) => (
              <label key={tpl.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="captive-template"
                  checked={selectedTemplateId === tpl.id}
                  onChange={() => setSelectedTemplateId(tpl.id)}
                  className="h-4 w-4 border-line-soft"
                />
                {tpl.name}
                {tpl.isDefault && (
                  <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-warn">
                    Par défaut
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

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

      {/* ── Récapitulatif ─────────────────────────────────────────────── */}
      <dl className="mt-4 grid grid-cols-1 gap-3 rounded-md bg-clay p-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-ink-soft">Hotspot</dt>
          <dd className="font-medium text-ink">
            {hotspotName || "—"} · {hotspotAddress}/{hotspotPrefixBits}
            {!hotspotBridge && " (bridge manquant à l'Étape 2)"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Wi-Fi / domaine</dt>
          <dd className="font-medium text-ink">
            {ssid || "—"} · {dnsName || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">MikHmon / portail</dt>
          <dd className="font-medium text-ink">
            {mikhmonIncluded ? "Inclus" : "Ignoré"} ·{" "}
            {installCaptivePortal
              ? (packageTemplates.find((t) => t.id === selectedTemplateId)?.name ?? "Portail par défaut")
              : "Page RouterOS"}
          </dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-ink-soft">Profils voucher ({customProfiles.length})</dt>
          <dd className="font-medium text-ink">
            {customProfiles.map((p) => p.label).join(", ") || "Aucun"}
          </dd>
        </div>
      </dl>

      {pending && (
        <div className="mt-6 flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-md border-2 border-line bg-paper p-8">
          <FancyLoader variant="router-orbit" size="lg" color="brand" />
          <p className="text-center text-sm font-medium text-ink animate-pulse">
            Configuration en cours sur le routeur…
          </p>
          <p className="text-center text-xs text-ink-soft">
            Hotspot, portail captif, profils voucher et règles NAT sont en cours de déploiement.
            Ne fermez pas cette page.
          </p>
        </div>
      )}

      {result?.error && (
        <p className="mt-4 rounded-md bg-err-soft px-3 py-2 text-sm text-err">{result.error}</p>
      )}
      {result?.firmwareUpdating && (
        <p className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-warn">{result.message}</p>
      )}
      {result?.success && (
        <div className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-ok">
          <p className="font-medium">
            Configuration appliquée. Le routeur redémarre — patientez ~1 minute avant de joindre
            le portail.
          </p>
          {result.log && (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-ok/80">
              {result.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result?.success && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">
            Vérification en direct sur le routeur (relisez l&apos;état réel une fois qu&apos;il
            a redémarré, avec le bouton « Réessayer » si besoin) :
          </p>
          <ConfigAuditBanner routerId={routerId} />
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center sm:justify-start gap-1.5 rounded-lg border border-line-soft px-4 py-3 sm:py-2.5 text-sm font-medium text-ink-soft hover:bg-clay transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Précédent
        </button>
        <button
          type="button"
          disabled={launchBlocked}
          onClick={run}
          className="flex items-center justify-center sm:justify-start gap-2 rounded-md bg-ink px-5 py-3 sm:py-2.5 text-sm font-medium text-white hover:bg-[#3A362F] disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          {pending && <FancyLoader variant="spinner-slice" size="sm" color="white" className="inline-flex" />}
          {pending ? "Configuration en cours…" : "Lancer l'auto-setup complet"}
        </button>
      </div>
    </div>
  );
}
