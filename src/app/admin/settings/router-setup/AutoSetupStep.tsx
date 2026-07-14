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

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Box, Check, Copy, Plus, Trash2 } from "lucide-react";
import { provisionHotspotStack, getAutoSetupBillingStatus } from "@/lib/mikrotik/container-setup";
import { getAutoSetupGateStatus } from "@/lib/billing/auto-setup-authorization-actions";
import { listCaptiveTemplates } from "@/lib/captive-templates/actions";
import { listActivePackages } from "@/lib/packages/actions";
import AutoSetupPaywallModal from "./AutoSetupPaywallModal";
import SerialUnlockRequestModal from "@/components/mikrotik/SerialUnlockRequestModal";
import { getSerialUnlockStatus } from "@/lib/mikrotik/serial-unlock-actions";
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

  // Le réseau (passerelle/classe/sous-réseau) est saisi UNE SEULE FOIS à
  // l'Étape 2 (topologie / assignation des interfaces au bridge) et hérité ici
  // en lecture seule — plus de double saisie. Les valeurs restent dans l'état
  // (pré-remplies depuis le bridge) pour le lancement et la persistance.

  // ── Essentiels : un seul champ obligatoire, le reste est dérivé ──────
  const [hotspotName, setHotspotName] = useState("");
  const [ssid, setSsid] = useState("");
  const [ssidTouched, setSsidTouched] = useState(false);
  const [dnsName, setDnsName] = useState("");
  const [dnsTouched, setDnsTouched] = useState(false);

  // Facultatif, et sans objet sur les modèles filaires (RB4011iGS+RM,
  // RB3011, RB5009, hEX…) : le champ SSID est alors masqué et aucun SSID
  // n'est dérivé du nom du hotspot ni envoyé au routeur.
  const hasWifi = detected?.hasWifi ?? true;

  function onHotspotNameChange(value: string) {
    setHotspotName(value);
    if (!ssidTouched && hasWifi) setSsid(value);
    if (!dnsTouched) {
      const slug = slugifyDomain(value);
      setDnsName(slug ? `${slug}.wifi` : "");
    }
  }

  const [hasUsbStorage, setHasUsbStorage] = useState(false);
  const [usbTouched, setUsbTouched] = useState(false);
  const [skipMikhmon, setSkipMikhmon] = useState(false);
  const [installCaptivePortal, setInstallCaptivePortal] = useState(true);
  // Compte hotspot facultatif créé pour l'admin (accès internet via le portail
  // sans acheter de forfait). Vide = aucun compte créé.
  const [adminPortalUser, setAdminPortalUser] = useState("");
  const [adminPortalPassword, setAdminPortalPassword] = useState("");
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

  // ── Persistance de l'étape 3 à travers la redirection de paiement ────
  // Payer l'auto-setup fait une navigation pleine page vers GeniusPay puis
  // revient (?etape=3) : sans ça, tout ce que l'admin a saisi ici (nom hotspot,
  // SSID, DNS, réseau, profils-prix, template…) repartait à zéro. On sauvegarde
  // un instantané dans sessionStorage (par routeur, même onglet) et on le
  // restaure au montage. Effacé au succès du lancement.
  const persistKey = `slh:autosetup:${routerId}`;
  const hadSnapshotRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydratation ponctuelle au montage depuis sessionStorage (retour de paiement) ; l'init paresseux de useState provoquerait un mismatch d'hydratation SSR */
    try {
      const raw = sessionStorage.getItem(persistKey);
      if (raw) {
        const s = JSON.parse(raw) as Record<string, unknown>;
        hadSnapshotRef.current = true;
        if (typeof s.hotspotName === "string") setHotspotName(s.hotspotName);
        if (typeof s.ssid === "string") setSsid(s.ssid);
        if (typeof s.ssidTouched === "boolean") setSsidTouched(s.ssidTouched);
        if (typeof s.dnsName === "string") setDnsName(s.dnsName);
        if (typeof s.dnsTouched === "boolean") setDnsTouched(s.dnsTouched);
        if (typeof s.hotspotAddress === "string") setHotspotAddress(s.hotspotAddress);
        if (s.networkClass) setNetworkClass(s.networkClass as NetworkClass);
        if (typeof s.hotspotPrefixBits === "number") setHotspotPrefixBits(s.hotspotPrefixBits);
        if (typeof s.hasUsbStorage === "boolean") setHasUsbStorage(s.hasUsbStorage);
        if (typeof s.usbTouched === "boolean") setUsbTouched(s.usbTouched);
        if (typeof s.skipMikhmon === "boolean") setSkipMikhmon(s.skipMikhmon);
        if (typeof s.installCaptivePortal === "boolean")
          setInstallCaptivePortal(s.installCaptivePortal);
        if (typeof s.adminPortalUser === "string") setAdminPortalUser(s.adminPortalUser);
        if (typeof s.adminPortalPassword === "string")
          setAdminPortalPassword(s.adminPortalPassword);
        if (typeof s.selectedTemplateId === "string") setSelectedTemplateId(s.selectedTemplateId);
        if (Array.isArray(s.customProfiles)) setCustomProfiles(s.customProfiles as VoucherProfile[]);
        if (Array.isArray(s.customProfileMeta))
          setCustomProfileMeta(s.customProfileMeta as typeof customProfileMeta);
        if (typeof s.customAmount === "string") setCustomAmount(s.customAmount);
        if (s.customUnit) setCustomUnit(s.customUnit as DurationUnit);
        if (typeof s.customPrice === "string") setCustomPrice(s.customPrice);
      }
    } catch {
      /* sessionStorage indisponible / JSON corrompu : on repart des défauts */
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [persistKey]);

  useEffect(() => {
    if (!hydrated) return; // n'écrase pas l'instantané avec les défauts avant restauration
    try {
      sessionStorage.setItem(
        persistKey,
        JSON.stringify({
          hotspotName,
          ssid,
          ssidTouched,
          dnsName,
          dnsTouched,
          hotspotAddress,
          networkClass,
          hotspotPrefixBits,
          hasUsbStorage,
          usbTouched,
          skipMikhmon,
          installCaptivePortal,
          adminPortalUser,
          adminPortalPassword,
          selectedTemplateId,
          customProfiles,
          customProfileMeta,
          customAmount,
          customUnit,
          customPrice,
        }),
      );
    } catch {
      /* quota / mode privé : la persistance est best-effort */
    }
  }, [
    hydrated,
    persistKey,
    hotspotName,
    ssid,
    ssidTouched,
    dnsName,
    dnsTouched,
    hotspotAddress,
    networkClass,
    hotspotPrefixBits,
    hasUsbStorage,
    usbTouched,
    skipMikhmon,
    installCaptivePortal,
    adminPortalUser,
    adminPortalPassword,
    selectedTemplateId,
    customProfiles,
    customProfileMeta,
    customAmount,
    customUnit,
    customPrice,
  ]);

  useEffect(() => {
    listCaptiveTemplates().then((rows) => {
      const templates = rows
        .filter((r) => r.templateType === "package")
        .map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault }));
      setPackageTemplates(templates);
      const preselected = templates.find((t) => t.isDefault) ?? templates[0];
      // Ne pas écraser le template restauré depuis l'instantané de paiement.
      if (preselected && !hadSnapshotRef.current) setSelectedTemplateId(preselected.id);
    });
    listActivePackages().then((pkgs) => {
      // État restauré (retour de paiement) : les profils de l'instantané font
      // foi — on ne ré-importe pas (ça re-ajouterait ceux que l'admin a retirés).
      if (hadSnapshotRef.current) return;
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
    containerPending?: boolean;
    serialLocked?: boolean;
    serial?: string | null;
  } | null>(null);

  // Déblocage (support) d'un MikroTik rattaché à un autre compte (verrou de
  // série). Ouvert depuis le message d'erreur quand result.serialLocked.
  const [unlockModal, setUnlockModal] = useState<{ serial: string; latestStatus: string | null } | null>(
    null,
  );

  // Auto-setup réussi : l'instantané n'a plus lieu d'être → on l'efface pour ne
  // pas re-restaurer une config périmée au prochain passage dans l'étape 3.
  useEffect(() => {
    if (result?.success) {
      try {
        sessionStorage.removeItem(persistKey);
      } catch {
        /* best-effort */
      }
    }
  }, [result?.success, persistKey]);

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

  // TEMPORAIRE — porte de monétisation manuelle : hors superadmin, le
  // lancement est bloqué tant qu'une demande n'est pas validée.
  // TODO: Remplacer par système de paiement intégré.
  const [gate, setGate] = useState<{
    superadmin: boolean;
    authorized: boolean;
    latestStatus: string | null;
  } | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const refreshGate = () => {
    getAutoSetupGateStatus(routerId).then(setGate);
  };
  useEffect(() => {
    let cancelled = false;
    getAutoSetupGateStatus(routerId).then((g) => {
      if (!cancelled) setGate(g);
    });
    return () => {
      cancelled = true;
    };
  }, [routerId]);

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
    // Porte de monétisation : si non autorisé (et pas superadmin), on ouvre
    // le modal de paiement au lieu de lancer. Le serveur revérifie de toute
    // façon (needsAuthorization) — l'UI n'est qu'un raccourci.
    if (gate && !gate.superadmin && !gate.authorized) {
      setPaywallOpen(true);
      return;
    }
    setResult(null);
    startTransition(async () => {
      const res = await provisionHotspotStack(routerId, {
        hotspotAddress,
        hotspotPrefixBits,
        hotspotName,
        dnsName,
        // Jamais de SSID vers un modèle sans Wi-Fi — même si le champ a été
        // auto-rempli avant que la détection ne réponde.
        ssid: hasWifi ? ssid.trim() || undefined : undefined,
        // Compte admin optionnel (accès internet via le portail sans forfait).
        defaultHotspotUsers: adminPortalUser.trim()
          ? [{ name: adminPortalUser.trim(), password: adminPortalPassword.trim() || undefined }]
          : [],
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
      // Verrou serveur : si l'autorisation a expiré/été consommée entre-temps,
      // on rouvre le paywall plutôt que d'afficher une erreur brute.
      if (res && "needsAuthorization" in res && res.needsAuthorization) {
        setPaywallOpen(true);
        refreshGate();
        return;
      }
      setResult(res);
    });
  }

  // Non superadmin → soumis à la porte de monétisation manuelle.
  const underManualGate = gate ? !gate.superadmin : false;

  const launchBlocked =
    pending ||
    !hotspotBridge ||
    !subnet ||
    !hotspotName.trim() ||
    (mikhmonIncluded && requiresUsbForContainer && !hasUsbStorage) ||
    (mikhmonIncluded && containerBlockedReason === "device-mode") ||
    // Sous la porte manuelle (non superadmin), le bouton reste cliquable même
    // sans solde wallet : le clic ouvre le paywall de paiement/demande. La
    // facturation wallet ne bloque que hors porte (superadmin/essai gratuit).
    (!underManualGate && billing !== null && !billing.sufficientBalance);

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
            // Les badges de facturation wallet n'ont plus de sens sous la porte
            // manuelle (le paiement passe par la demande d'autorisation).
            !underManualGate &&
            billing &&
            (billing.isFree || billing.alreadyBilled) && (
              <TrialBadge
                active
                activeLabel={billing.alreadyBilled ? "Déjà configuré" : "1er routeur gratuit"}
              />
            )
          )}
          {underManualGate &&
            (gate?.authorized ? (
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                Accès autorisé ✓
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                {gate?.latestStatus === "pending" ? "Demande en attente" : "Payant"}
              </span>
            ))}
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

      {/* ── Réseau du hotspot : hérité de l'Étape 2, non ré-éditable ici ── */}
      <div className="mt-5 rounded-md border border-line-soft bg-paper p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Réseau du hotspot</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Défini à l&apos;Étape 2 (topologie / assignation des interfaces au bridge). Pour le
              changer, revenez à l&apos;étape précédente — plus besoin de le re-saisir ici.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-md border border-line-soft px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-clay"
          >
            Modifier à l&apos;Étape 2
          </button>
        </div>
        <p className="mt-3 rounded-md bg-clay px-3 py-2.5 text-sm text-ink-soft">
          Passerelle :{" "}
          <span className="font-semibold text-ink">
            {hotspotAddress}/{hotspotPrefixBits}
          </span>
          {subnet ? ` — ${getImpactNote(hotspotPrefixBits)}` : ""}
        </p>
      </div>

      {/* ── Compte administrateur du portail (accès internet) ────────── */}
      <div className="mt-5 rounded-md border border-line-soft bg-paper p-4 sm:p-5">
        <p className="text-sm font-semibold text-ink">Compte administrateur du portail</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Optionnel — crée un identifiant pour vous connecter au WiFi via le portail sans acheter de
          forfait (accès internet illimité). Laissez vide si vous n&apos;en voulez pas.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="as-admin-user" className="mb-1.5 block text-sm font-medium text-ink-soft">
              Identifiant
            </label>
            <input
              id="as-admin-user"
              type="text"
              autoComplete="off"
              value={adminPortalUser}
              onChange={(e) => setAdminPortalUser(e.target.value)}
              placeholder="admin"
              className="w-full rounded-md border border-line-soft px-3 py-2.5 text-sm focus:border-ok focus:outline-none focus:ring-1 focus:ring-ok/20 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="as-admin-pass" className="mb-1.5 block text-sm font-medium text-ink-soft">
              Mot de passe
            </label>
            <input
              id="as-admin-pass"
              type="text"
              autoComplete="off"
              value={adminPortalPassword}
              onChange={(e) => setAdminPortalPassword(e.target.value)}
              placeholder="défaut : identique à l'identifiant"
              className="w-full rounded-md border border-line-soft px-3 py-2.5 text-sm focus:border-ok focus:outline-none focus:ring-1 focus:ring-ok/20 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* ── Identité du hotspot ─────────────────────────────────────── */}
      <div className="mt-5 rounded-md border border-line-soft bg-paper p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="as-hotspot-name" className="mb-1.5 block text-sm font-medium text-ink-soft">
              Nom du hotspot
            </label>
            <input
              id="as-hotspot-name"
              value={hotspotName}
              onChange={(e) => onHotspotNameChange(e.target.value)}
              placeholder="MIRADOR-WIFI"
              className="w-full rounded-md border border-line-soft px-3 py-2.5 text-sm placeholder:text-ink-soft/60 focus:border-ok focus:outline-none focus:ring-1 focus:ring-ok/20 transition-colors"
            />
          </div>
          {hasWifi && (
            <div>
              <label htmlFor="as-ssid" className="mb-1.5 block text-sm font-medium text-ink-soft">
                Nom du réseau Wi-Fi (SSID){" "}
                <span className="font-normal text-ink-soft/70">(facultatif)</span>
              </label>
              <input
                id="as-ssid"
                value={ssid}
                onChange={(e) => {
                  setSsidTouched(true);
                  setSsid(e.target.value);
                }}
                placeholder="Identique au nom du hotspot"
                className="w-full rounded-md border border-line-soft px-3 py-2.5 text-sm placeholder:text-ink-soft/60 focus:border-ok focus:outline-none focus:ring-1 focus:ring-ok/20 transition-colors"
              />
            </div>
          )}
          <div>
            <label htmlFor="as-dns" className="mb-1.5 block text-sm font-medium text-ink-soft">
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
              className="w-full rounded-md border border-line-soft px-3 py-2.5 text-sm placeholder:text-ink-soft/60 focus:border-ok focus:outline-none focus:ring-1 focus:ring-ok/20 transition-colors"
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-ink-soft/80">
          {hasWifi
            ? "SSID et domaine se remplissent automatiquement depuis le nom du hotspot — modifiez-les seulement si besoin."
            : "Ce modèle n'a pas de Wi-Fi — le domaine se remplit automatiquement depuis le nom du hotspot, le SSID est ignoré."}
        </p>
      </div>

      {/* ── MikHmon : décision automatique, avertissements ciblés ────── */}
      {containerBlockedReason === "architecture" && (
        <p className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-warn">
          Container indisponible sur cet appareil (architecture non compatible) — MikHmon sera
          ignoré, seul le hotspot sera configuré.
        </p>
      )}

      {archSupportsContainers && containerBlockedReason === "device-mode" && !skipMikhmon && (
        <div className="mt-5 rounded-md border border-warn/30 bg-clay p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm font-medium text-warn">
              Container verrouillé par le mode RouterOS sur cet appareil.
            </p>
            <button
              type="button"
              onClick={revalidateDetection}
              disabled={revalidating}
              className="shrink-0 rounded-md border border-warn px-3 py-1.5 text-sm font-medium text-warn hover:bg-clay disabled:opacity-50 transition-colors"
            >
              {revalidating ? "Vérification…" : "Relancer la vérification"}
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-warn/80">
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
      <div className="mt-5 rounded-md border border-line-soft bg-paper p-4 sm:p-5">
        <p className="text-sm font-semibold text-ink">Profils voucher</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Pré-remplis depuis vos forfaits actifs — chaque profil est créé sur le routeur avec
          expiration automatique, et les nouveaux sont synchronisés sur la page Forfaits.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {customProfiles.length === 0 && (
            <p className="text-sm text-ink-soft italic">
              Aucun profil — créez-en au moins un ci-dessous (ex : 1 jour, 500 FCFA).
            </p>
          )}
          {customProfiles.map((profile) => (
            <span
              key={profile.name}
              className="flex items-center gap-1.5 rounded-md border border-ok bg-clay px-3 py-1.5 text-sm font-medium text-ok"
            >
              {profile.label}
              <button
                type="button"
                onClick={() => removeCustomProfile(profile.name)}
                title="Retirer ce profil"
                aria-label={`Retirer le profil ${profile.label}`}
                className="text-ok hover:text-ink transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">Durée</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                aria-label="Durée du profil"
                className="w-20 rounded-md border border-line-soft px-2 py-1.5 text-sm focus:border-ok focus:outline-none"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as DurationUnit)}
                aria-label="Unité de durée"
                className="rounded-md border border-line-soft px-2 py-1.5 text-sm focus:border-ok focus:outline-none"
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
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">Prix (FCFA)</label>
            <input
              type="number"
              min={0}
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder="0"
              className="w-24 rounded-md border border-line-soft px-2 py-1.5 text-sm focus:border-ok focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={addCustomProfile}
            className="flex items-center gap-1 rounded-md border border-line-soft px-3 py-1.5 text-sm font-medium text-ink hover:bg-clay transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>
        {customProfileError && <p className="mt-2 text-sm text-err">{customProfileError}</p>}
      </div>

      {/* ── Portail captif ────────────────────────────────────────────── */}
      <div className="mt-5 rounded-md border border-line-soft bg-paper p-4 sm:p-5">
        <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={installCaptivePortal}
            onChange={(e) => setInstallCaptivePortal(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line-soft accent-brand"
          />
          <span>
            <span className="block font-semibold">Installer le portail captif</span>
            <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
              Remplace la page de connexion RouterOS par le portail captif (plans, paiement
              mobile money, vendeurs agréés).
            </span>
          </span>
        </label>
        {installCaptivePortal && packageTemplates.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-line-soft pt-4">
            <p className="text-sm text-ink-soft">
              Choisissez le portail à installer — importez les vôtres depuis{" "}
              <Link
                href={`/admin/settings/captive-templates?retour=${routerId}`}
                className="font-medium text-brand-deep underline hover:text-ink transition-colors"
              >
                Paramètres → Portail captif
              </Link>
              .
            </p>
            <div className="space-y-2">
              {packageTemplates.map((tpl) => (
                <label key={tpl.id} className="flex items-center gap-2.5 rounded-md border border-line-soft px-3 py-2.5 text-sm text-ink hover:bg-clay cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="captive-template"
                    checked={selectedTemplateId === tpl.id}
                    onChange={() => setSelectedTemplateId(tpl.id)}
                    className="h-4 w-4 border-line-soft accent-brand"
                  />
                  <span className="font-medium">{tpl.name}</span>
                  {tpl.isDefault && (
                    <span className="rounded-full bg-clay px-2 py-0.5 text-[11px] font-medium text-warn">
                      Par défaut
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ancien paywall wallet — masqué sous la porte manuelle (le paiement
          passe désormais par la demande d'autorisation superadmin). */}
      {!underManualGate && billing && !billing.isFree && !billing.alreadyBilled && (
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
      <div className="mt-5 rounded-md border border-line-soft bg-clay p-4 sm:p-5">
        <p className="text-sm font-semibold text-ink mb-3">Récapitulatif avant lancement</p>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-1">Hotspot</dt>
            <dd className="font-semibold text-ink leading-snug">
              {hotspotName || "—"} · {hotspotAddress}/{hotspotPrefixBits}
              {!hotspotBridge && (
                <span className="block text-xs text-warn mt-0.5">bridge manquant à l&apos;Étape 2</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-1">Wi-Fi / domaine</dt>
            <dd className="font-semibold text-ink leading-snug">
              {hasWifi ? ssid || "—" : "Pas de Wi-Fi"} · {dnsName || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-1">MikHmon / portail</dt>
            <dd className="font-semibold text-ink leading-snug">
              {mikhmonIncluded ? "Inclus" : "Ignoré"} ·{" "}
              {installCaptivePortal
                ? (packageTemplates.find((t) => t.id === selectedTemplateId)?.name ?? "Portail par défaut")
                : "Page RouterOS"}
            </dd>
          </div>
          <div className="sm:col-span-3 border-t border-line-soft pt-3 mt-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-soft mb-1">
              Profils voucher ({customProfiles.length})
            </dt>
            <dd className="font-semibold text-ink leading-snug">
              {customProfiles.map((p) => p.label).join(", ") || "Aucun — ajoutez au moins un profil"}
            </dd>
          </div>
        </dl>
      </div>

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
        <div className="mt-4 rounded-md bg-err-soft px-3 py-2 text-sm text-err">
          <p>{result.error}</p>
          {result.serialLocked && result.serial && (
            <button
              type="button"
              onClick={async () => {
                const serial = result.serial!;
                const status = await getSerialUnlockStatus(serial).catch(() => ({
                  latestStatus: null,
                }));
                setUnlockModal({ serial, latestStatus: status.latestStatus });
              }}
              className="mt-2 inline-flex items-center rounded-md bg-brand-deep px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Demander le déblocage
            </button>
          )}
          {result.log && (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-err/80">
              {result.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {unlockModal && (
        <SerialUnlockRequestModal
          open
          serial={unlockModal.serial}
          routerId={routerId}
          latestStatus={unlockModal.latestStatus}
          onClose={() => setUnlockModal(null)}
        />
      )}
      {result?.firmwareUpdating && (
        <p className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-warn">{result.message}</p>
      )}
      {result?.success && (
        <div className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-ok">
          <p className="font-medium">
            {result.containerPending
              ? "Configuration appliquée. MikHmon continue de se télécharger sur le routeur ; vérifiez son état dans une minute."
              : "Configuration appliquée. Le routeur redémarre — patientez ~1 minute avant de joindre le portail."}
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

      {/* Porte de monétisation manuelle (temporaire). */}
      <AutoSetupPaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        routerId={routerId}
        supportsContainers={mikhmonIncluded}
        latestStatus={gate?.latestStatus ?? null}
        onSubmitted={refreshGate}
      />
    </div>
  );
}
