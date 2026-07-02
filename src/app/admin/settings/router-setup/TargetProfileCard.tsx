"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Check, ClipboardCheck, Copy, Network, ServerCog, ShieldCheck } from "lucide-react";
import {
  ROUTER_SETUP_PROFILE,
  getRouterSetupChecklist,
} from "@/lib/mikrotik/router-setup-profile";

const profile = ROUTER_SETUP_PROFILE;

export default function TargetProfileCard() {
  const [copied, setCopied] = useState(false);
  const checklist = useMemo(() => getRouterSetupChecklist(), []);

  function copyChecklist() {
    const text = checklist.map((item) => `- ${item}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-6 border-2 border-line bg-paper p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-ok" />
            <h2 className="font-semibold text-ink">
              Profil cible SafeLinkHub
            </h2>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Reproduction du routeur de référence audité : {profile.referenceDevice},
            RouterOS {profile.routerosVersion}, topologie hotspot + MikHmon.
          </p>
        </div>
        <button
          type="button"
          onClick={copyChecklist}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-line-soft px-3 py-2 text-sm font-medium text-ink hover:bg-clay"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copié" : "Copier la checklist"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <ProfileSection
          icon={<Network className="h-4 w-4" />}
          title="Hotspot"
          lines={[
            `Bridge ${profile.hotspotBridge.name}`,
            `Passerelle ${profile.hotspotBridge.gateway}`,
            `Pool ${profile.hotspotBridge.poolRange}`,
            `Ports ${profile.hotspotBridge.ports.join(", ")}`,
          ]}
        />
        <ProfileSection
          icon={<ServerCog className="h-4 w-4" />}
          title="MikHmon"
          lines={[
            `Bridge ${profile.containerBridge.name}`,
            `${profile.containerBridge.vethName} ${profile.containerBridge.vethAddress}`,
            `Image ${profile.containerBridge.image}`,
            `Ports ${profile.containerBridge.remoteAccessPort}/${profile.containerBridge.localWebPort}`,
          ]}
        />
        <ProfileSection
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Gestion"
          lines={[
            `WAN ${profile.wanInterface}`,
            `API ${profile.management.apiPort}, Winbox ${profile.management.winboxPort}`,
            `WebFig ${profile.management.webfigPort}`,
            `Services coupés : ${profile.management.disabledServices.join(", ")}`,
          ]}
        />
      </div>

      <div className="mt-4 rounded-md bg-clay px-3 py-2.5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
          Préflight avant auto-setup
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-ink-soft sm:grid-cols-2">
          {checklist.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ProfileSection({
  icon,
  title,
  lines,
}: {
  icon: ReactNode;
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-lg border border-line-soft bg-clay/70 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-ink-soft">{icon}</span>
        {title}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-ink-soft">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
