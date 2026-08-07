"use client";

// Carte « Parrainage » du tableau de bord facturation : le lien à partager, le
// barème, ce que le parrainage a déjà rapporté, et la liste des filleuls.

import { useState } from "react";
import { Gift, Copy, Check, Users, Share2 } from "lucide-react";
// Import depuis rewards.ts (module pur) et NON service.ts : ce dernier tire
// getDb/`pg`, qui n'a rien à faire dans un bundle client.
import {
  REFERRAL_EVENT_LABEL,
  REFERRAL_REWARD_SC,
  type ReferralEvent,
} from "@/lib/referrals/rewards";

type Reward = {
  id: string;
  event: ReferralEvent;
  amountScCents: number;
  referredName: string;
  dateLabel: string;
};

function formatSc(scCents: number) {
  return `${(scCents / 100).toLocaleString("fr-FR")} SC`;
}

export default function ReferralCard({
  code,
  shareUrl,
  totalScCents,
  referredCount,
  rewards,
  referred,
}: {
  code: string;
  shareUrl: string;
  totalScCents: number;
  referredCount: number;
  rewards: Reward[];
  referred: { id: string; name: string; contact: string | null; dateLabel: string }[];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé (permission, http) : le champ reste sélectionnable
      // à la main, on n'affiche pas d'erreur pour si peu.
    }
  }

  return (
    <div className="border-2 border-line bg-paper p-6">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-brand-deep" aria-hidden="true" />
        <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">Parrainage</h2>
        <span className="ml-auto font-mono text-sm font-bold text-brand-deep">
          {formatSc(totalScCents)} gagnés
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Partagez votre lien : chaque personne qui crée un compte avec vous rapporte des Safecoins,
        puis vous en rapporte encore quand elle fait ses premiers pas.
      </p>

      {/* Barème — les trois étapes primées, dans l'ordre où elles arrivent. */}
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {(Object.keys(REFERRAL_REWARD_SC) as ReferralEvent[]).map((event) => (
          <li key={event} className="border-2 border-line-soft bg-clay/40 px-3 py-2">
            <p className="font-mono text-base font-bold text-ink">
              +{REFERRAL_REWARD_SC[event]} SC
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">{REFERRAL_EVENT_LABEL[event]}</p>
          </li>
        ))}
      </ul>

      <label className="mt-5 block text-sm font-bold text-ink" htmlFor="referral-link">
        Votre lien d&apos;invitation
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="referral-link"
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full border-2 border-line bg-paper px-3 py-2.5 font-mono text-xs text-ink focus:outline-none focus:ring-4 focus:ring-brand/35"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 border-2 border-line bg-brand px-3 py-2.5 text-sm font-bold text-[#1C1917] hover:opacity-90"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">
        Code : <span className="font-mono font-bold text-ink">{code}</span> · il peut aussi être
        recopié à la main.
      </p>

      <a
        href={`https://wa.me/?text=${encodeURIComponent(
          `Rejoignez SafeLinkHub pour gérer votre hotspot WiFi : ${shareUrl}`,
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 border-2 border-line px-3 py-2 text-sm font-bold text-ink hover:bg-clay"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Partager sur WhatsApp
      </a>

      <div className="mt-6 flex items-center gap-2 border-t-2 border-line-soft pt-4">
        <Users className="h-4 w-4 text-ink-soft" aria-hidden="true" />
        <p className="text-sm font-bold text-ink">
          {referredCount === 0
            ? "Aucun filleul pour l'instant"
            : `${referredCount} filleul${referredCount > 1 ? "s" : ""}`}
        </p>
      </div>

      {referred.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {referred.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold text-ink">{r.name}</span>
              {r.contact && <span className="text-xs text-ink-soft">{r.contact}</span>}
              <span className="ml-auto text-xs text-ink-soft">{r.dateLabel}</span>
            </li>
          ))}
        </ul>
      )}

      {rewards.length > 0 && (
        <>
          <p className="mt-5 text-sm font-bold text-ink">Primes versées</p>
          <ul className="mt-2 space-y-1.5">
            {rewards.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-mono font-bold text-brand-deep">
                  +{formatSc(r.amountScCents)}
                </span>
                <span className="text-ink">{REFERRAL_EVENT_LABEL[r.event]}</span>
                <span className="text-xs text-ink-soft">— {r.referredName}</span>
                <span className="ml-auto text-xs text-ink-soft">{r.dateLabel}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
